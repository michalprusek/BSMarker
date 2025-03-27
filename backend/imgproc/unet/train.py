import numpy as np
import imageio.v3 as iio
import json

from arch import Unet
import torchvision
import torch
import torch.nn.functional as F

import pickle
import os

import tqdm


EPOCHS = 1000
BATCH_SIZE = 16
SIZE = (512, 512)
DATASET_PATH = pathlib.Path("dataset/")
DEVICE="cuda" if torch.cuda.is_available() else "cpu"


class SegmentationDataset(torch.utils.data.Dataset):
	def __init__(self, path=DATASET_PATH, size=SIZE, device="cuda"):
		self.path = path
		self.size = size
		self.device = device
		self.images = os.listdir(path)

	def __len__(self):
		return len(self.frames)

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

		images = torch.tensor(np.array(images), device=self.device)
		masks = torch.tensor(np.array(masks), device=self.device)

		images = torchvision.transforms.functional.resize(images/255, self.size)
		masks = torchvision.transforms.functional.resize(masks/255, self.size)

		if single:
			return (images-0.5)*2, masks
		else:
			b, w, h = images.shape
			return ((images-0.5)*2).reshape(b, 1, w, h), masks.reshape(b, 1, w, h)


def main(device=DEVICE, epochs=EPOCHS):
	torch.manual_seed(0)

	dataset = SegmentationDataset(device=device)
	train, test = torch.utils.data.random_split(dataset, [np.floor(0.8*len(dataset)).astype(int), np.ceil(0.2*len(dataset)).astype(int)])
	test_X, test_y = test[:]

	loader = torch.utils.data.DataLoader(train, batch_size=BATCH_SIZE)

	net = Unet()
	net.to(device)
	loss_fn = torch.nn.BCEWithLogitsLoss()
	optimizer = torch.optim.Adam(net.parameters(), lr=1e-4)

	for e in range(1, epochs+1):
		print(f"epoch {e}")
		total_loss = 0
		for batch_X, batch_y in tqdm.tqdm(loader):
			optimizer.zero_grad()

			batch_y_ = net(batch_X)
			loss = loss_fn(batch_y_, batch_y)

			loss.backward()
			optimizer.step()

			total_loss += loss

		print("epoch loss", float(total_loss))
		test_y_ = net(test_X)
		print("test loss", float(loss_fn(test_y_, test_y)))
		pred_masks = F.sigmoid(test_y_) > 0.5
		real_masks = test_y >= 0.5

		i = (pred_masks&real_masks).sum(-1).sum(-1).sum(-1)
		u = pred_masks.sum(-1).sum(-1).sum(-1) + real_masks.sum(-1).sum(-1).sum(-1) - i
		u[u==0] = 1

		iou = (i/u).sum()/len(pred_masks)
		print("test average iou", float(iou))

		tp = ((pred_masks == real_masks) & real_masks).sum()
		tn = ((pred_masks == real_masks) & ~real_masks).sum()
		fn = ((pred_masks != real_masks) & real_masks).sum()
		fp = ((pred_masks != real_masks) & ~real_masks).sum()
		no_class = real_masks.shape[0] * real_masks.shape[2] * real_masks.shape[3]
		print("test average precision", float(tp/(tp+fp)))
		print("test average recall", float(tp/(tp+fn)))
		print("test average pixel accuracy", float((pred_masks==real_masks).sum()/no_class))

		dataset.setup_cache()

		if e%100 == 0:
			torch.save(net, f"model{e}.pth")

	torch.save(net, "model.pth")


if __name__ == "__main__":
	main()

#net.eval()
#res = net(test_X[0:1]).detach().numpy()
#
#import matplotlib.pyplot as plt
#fig, ax = plt.subplots(1, 2)
#ax[0].imshow(res[0][0])
#ax[1].imshow(test_y[0][0])
#plt.show()
#
#breakpoint()