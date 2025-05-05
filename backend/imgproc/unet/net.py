import torch
import numpy as np

from dataset import load_dataset
import albumentations as A

import segmentation_models_pytorch as smp
import pytorch_lightning as pl
from pytorch_lightning.callbacks.early_stopping import EarlyStopping
from pytorch_lightning.loggers import TensorBoardLogger


class SegmentationModel(pl.LightningModule):
	def __init__(self, arch, encoder_name, T_max, **kwargs):
		super().__init__()
		self.model = smp.create_model(
			arch,
			encoder_name=encoder_name,
			in_channels=1,
			classes=1,
			**kwargs,
		)

		self.T_max = T_max

		self.loss_fn = smp.losses.FocalLoss(smp.losses.BINARY_MODE)
		#self.loss_fn2 = smp.losses.DiceLoss(smp.losses.BINARY_MODE, from_logits=True)

		self.training_step_outputs = []
		self.validation_step_outputs = []
		self.test_step_outputs = []

	def forward(self, image):
		mask = self.model(image/255 - 0.5)
		return mask
	
	def shared_step(self, batch, stage):
		image, mask = batch

		assert image.ndim == 4
		h, w = image.shape[2:]
		assert h % 32 == 0 and w % 32 == 0

		assert mask.ndim == 4
		assert mask.max() <= 1.0 and mask.min() >= 0

		logits_mask = self.forward(image)

		loss = self.loss_fn(logits_mask, mask)# + self.loss_fn2(logits_mask, mask)

		prob_mask = logits_mask.sigmoid()
		pred_mask = (prob_mask > 0.5).float()

		tp, fp, fn, tn = smp.metrics.get_stats(
			pred_mask.long(), mask.long(), mode="binary"
		)

		return {
			"loss": loss,
			"tp": tp,
			"fp": fp,
			"fn": fn,
			"tn": tn,
		}
	
	def shared_epoch_end(self, outputs, stage):
		tp = torch.cat([x["tp"] for x in outputs])
		fp = torch.cat([x["fp"] for x in outputs])
		fn = torch.cat([x["fn"] for x in outputs])
		tn = torch.cat([x["tn"] for x in outputs])

		per_image_iou = smp.metrics.iou_score(
			tp, fp, fn, tn, reduction="micro-imagewise"
		)

		dataset_iou = smp.metrics.iou_score(tp, fp, fn, tn, reduction="micro")
		metrics = {
			f"{stage}_per_image_iou": per_image_iou,
			f"{stage}_dataset_iou": dataset_iou,
			f"{stage}_loss": sum((x["loss"] for x in outputs)),
		}

		self.log_dict(metrics, prog_bar=True, sync_dist=True)

	def training_step(self, batch, batch_idx):
		train_loss_info = self.shared_step(batch, "train")
		self.training_step_outputs.append(train_loss_info)
		return train_loss_info

	def on_train_epoch_end(self):
		self.shared_epoch_end(self.training_step_outputs, "train")
		self.training_step_outputs.clear()
		return

	def validation_step(self, batch, batch_idx):
		valid_loss_info = self.shared_step(batch, "valid")
		self.validation_step_outputs.append(valid_loss_info)
		return valid_loss_info

	def on_validation_epoch_end(self):
		self.shared_epoch_end(self.validation_step_outputs, "valid")
		self.validation_step_outputs.clear()
		return

	def test_step(self, batch, batch_idx):
		test_loss_info = self.shared_step(batch, "test")
		self.test_step_outputs.append(test_loss_info)
		return test_loss_info

	def on_test_epoch_end(self):
		self.shared_epoch_end(self.test_step_outputs, "test")
		self.test_step_outputs.clear()
		return

	def configure_optimizers(self):
		optimizer = torch.optim.AdamW(self.parameters(), lr=1e-4)
		scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=self.T_max, eta_min=1e-6)
		return {
			"optimizer": optimizer,
			"lr_scheduler": {
				"scheduler": scheduler,
				"interval": "step",
				"frequency": 1,
			},
		}


SEED = 0
DATASET_PATH = "dataset/"
BATCH_SIZE = 32
EPOCHS = 150
VAL_RATIO = 0.1


def augment_train(batch):
	transform = A.Compose([
		A.SafeRotate(p=0.1, limit=[-15, 15]),
		A.CropNonEmptyMaskIfExists(1024, 1024, p=0.2),
		A.Resize(256, 256, p=1),
		A.GaussianBlur(p=0.1),
		A.RandomBrightnessContrast(brightness_limit=0.4, contrast_limit=0.4, p=0.5),
		A.HorizontalFlip(p=0.5),
		A.RandomRotate90(p=0.5),
		A.OneOf([
			A.ElasticTransform(p=0.6),
			A.GridElasticDeform(num_grid_xy=(12, 12), magnitude=10, p=0.4),
		], p=0.4),
	])
	images = []
	masks = []
	for image, mask in batch:
		result = transform(image=image[0].numpy(), mask=mask[0].numpy().astype(np.uint8))
		images.append(torch.tensor(result["image"].copy()).unsqueeze(0))
		masks.append(torch.tensor(result["mask"].copy()).bool().unsqueeze(0))

	return torch.stack(images), torch.stack(masks)


def augment_test(batch):
	transform = A.Compose([
		A.Resize(256, 256, p=1),
	])
	images = []
	masks = []
	for image, mask in batch:
		result = transform(image=image[0].numpy(), mask=mask[0].numpy().astype(np.uint8))
		images.append(torch.tensor(result["image"].copy()).unsqueeze(0))
		masks.append(torch.tensor(result["mask"].copy()).bool().unsqueeze(0))

	return torch.stack(images), torch.stack(masks)


if __name__ == "__main__":
	# Set seeds
	torch.manual_seed(SEED)
	np.random.seed(SEED)

	# Decrease precision
	torch.set_float32_matmul_precision("medium")

	# Prepare data loaders
	train_dataset, valid_dataset, test_dataset = load_dataset(DATASET_PATH, None, VAL_RATIO)
	train_loader = torch.utils.data.DataLoader(
		train_dataset, 
		batch_size=BATCH_SIZE, 
		shuffle=True, 
		num_workers=4,
		collate_fn=augment_train,
	)
	valid_loader = torch.utils.data.DataLoader(valid_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4, collate_fn=augment_test)
	test_loader = torch.utils.data.DataLoader(test_dataset, batch_size=1, shuffle=False, num_workers=4, collate_fn=augment_test)


	model = SegmentationModel("unet", "resnet50", T_max=EPOCHS*len(train_dataset))#, aux_params=dict(dropout=0.1, classes=1))

	logger = TensorBoardLogger("lightning_logs", name="unet_resnet50")
	trainer = pl.Trainer(
		max_epochs=EPOCHS, 
		log_every_n_steps=1,
		logger=logger,
		callbacks=[EarlyStopping(monitor="valid_dataset_iou", mode="max", patience=15)]
	)
	trainer.fit(
		model,
		train_dataloaders=train_loader,
		val_dataloaders=valid_loader,
	)

	test_metrics = trainer.test(model, dataloaders=test_loader, verbose=False)
	print(test_metrics)

