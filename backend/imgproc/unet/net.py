import torch
import os

import segmentation_models_pytorch as smp
import pytorch_lightning as pl


class SegmentationDataset(torch.utils.data.Dataset):
	def __init__(self, path=DATASET_PATH, size=SIZE):
		self.path = path
		self.size = size
		self.images = os.listdir(path / "imgs")

	def __len__(self):
		return len(self.images)

	def __getitem__(self, idx):
		single = False
		if torch.is_tensor(idx):
			idx = idx.tolist()
		elif not isinstance(idx, list):
			single = True
			idx = [idx]

		images = []
		masks = []
		for i in idx:
			images.append(iio.imread(self.path / "imgs" / self.images[i]))
			masks.append(iio.imread(self.path / "masks" / self.images[i]))

		images = torch.tensor(np.array(images))
		masks = torch.tensor(np.array(masks))

		images = torchvision.transforms.functional.resize(images/255, self.size)
		masks = torchvision.transforms.functional.resize(masks/255, self.size)

		if single:
			return (images-0.5)*2, masks
		else:
			b, w, h = images.shape
			return ((images-0.5)*2).reshape(b, 1, w, h), masks.reshape(b, 1, w, h)


