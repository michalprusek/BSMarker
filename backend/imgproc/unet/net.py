import torch
import numpy as np

from dataset import load_dataset

import segmentation_models_pytorch as smp
import pytorch_lightning as pl


class SegmentationModel(pl.LightningModule):
	def __init__(self, arch, encoder_name, T_max, **kwargs):
		super().__init__()
		self.model = smp.create_model(
			arch,
			encoder_name=encoder_name,
			in_channels=1,
			classes=1
		)

		self.T_max = T_max

		self.loss_fn = smp.losses.DiceLoss(smp.losses.BINARY_MODE, from_logits=True)

		self.training_step_outputs = []
		self.validation_step_outputs = []
		self.test_step_outputs = []

	def forward(self, image):
		mask = self.model(image)
		return mask
	
	def shared_step(self, batch, stage):
		image, mask = batch

		assert image.ndim == 4
		h, w = image.shape[2:]
		assert h % 32 == 0 and w % 32 == 0

		assert mask.ndim == 4
		assert mask.max() <= 1.0 and mask.min() >= 0

		logits_mask = self.forward(image)

		loss = self.loss_fn(logits_mask, mask)

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
		}

		self.log_dict(metrics, prog_bar=True, sync_dist=True)

	def training_step(self, batch, batch_idx):
		train_loss_info = self.shared_step(batch, "train")
		# append the metics of each step to the
		self.training_step_outputs.append(train_loss_info)
		return train_loss_info

	def on_train_epoch_end(self):
		self.shared_epoch_end(self.training_step_outputs, "train")
		# empty set output list
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
		# empty set output list
		self.test_step_outputs.clear()
		return

	def configure_optimizers(self):
		optimizer = torch.optim.Adam(self.parameters(), lr=2e-4)
		scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=self.T_max, eta_min=1e-5)
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
SIZE = (320, 320)
EPOCHS = 25
TEST_RATIO = 0.1
VAL_RATIO = 0.1


if __name__ == "__main__":
	# Set seeds
	torch.manual_seed(SEED)
	np.random.seed(SEED)

	# Decrease precision
	torch.set_float32_matmul_precision("medium")

	# Prepare data loaders
	train_dataset, valid_dataset, test_dataset = load_dataset(DATASET_PATH, SIZE, TEST_RATIO, VAL_RATIO)
	train_loader = torch.utils.data.DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=4)
	valid_loader = torch.utils.data.DataLoader(valid_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4)
	test_loader = torch.utils.data.DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4)


	model = SegmentationModel("unet", "resnet34", T_max=EPOCHS*len(train_dataset))
	trainer = pl.Trainer(max_epochs=EPOCHS, log_every_n_steps=1)
	trainer.fit(
		model,
		train_dataloaders=train_loader,
		val_dataloaders=valid_loader,
	)

	test_metrics = trainer.test(model, dataloaders=test_loader, verbose=False)
	print(test_metrics)

