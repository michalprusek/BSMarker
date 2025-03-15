import numpy as np
import imageio.v3 as iio
import json

from arch import Unet
import torchvision
import torch

import tqdm


EPOCHS = 300
BATCH_SIZE = 32
SIZE = (64, 64)


class SegmentationDataset(torch.utils.data.Dataset):
	def __init__(self, file, prefix="", device="cuda"):
		self.prefix = prefix
		with open(file, "r") as f:
			self.frames = json.load(f)

		self.cache_image = {}
		self.cache_mask = {}
		self.use_cache = False

		self.device = device

	def __len__(self):
		return len(self.frames)

	def __getitem__(self, idx):
		single = False
		if torch.is_tensor(idx):
			idx = idx.tolist()
		elif not isinstance(idx, list):
			single = True
			idx = [idx]

		if self.use_cache:
			images = torch.tensor(np.array([self.cache_image[i] for i in idx]), device=self.device)
			masks = torch.tensor(np.array([self.cache_mask[i] for i in idx]), device=self.device)
		else:
			images = []
			masks = []
			for i in idx:
				images.append(iio.imread(self.prefix + self.frames[i]["image"]))
				masks.append(iio.imread(self.prefix + self.frames[i]["mask"]))
			images = torch.tensor(np.array(images), device=self.device)
			masks = torch.tensor(np.array(masks), device=self.device)

			images = torchvision.transforms.functional.resize(images/255, SIZE)
			masks = torchvision.transforms.functional.resize(masks/255, SIZE)

			for c, i in enumerate(idx):
				self.cache_image[i] = images[c].cpu()
				self.cache_mask[i] = masks[c].cpu()

		if single:
			return images, masks
		else:
			b, w, h = images.shape
			return images.reshape(b, 1, w, h), masks.reshape(b, 1, w, h)


def train(data_file, device, epochs=EPOCHS):
	dataset = SegmentationDataset(data_file, device=device)
	train, test = torch.utils.data.random_split(dataset, [np.floor(0.8*len(dataset)).astype(int), np.ceil(0.2*len(dataset)).astype(int)])
	test_X, test_y = test[:]

	loader = torch.utils.data.DataLoader(train, batch_size=BATCH_SIZE)

	net = Unet()
	net.to(device)
	loss_fn = torch.nn.BCEWithLogitsLoss()
	optimizer = torch.optim.Adam(net.parameters())

	for e in range(epochs):
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

		dataset.use_cache = True

	torch.save(net, "model.pth")


if __name__ == "__main__":
	train("data.json", "cuda" if torch.cuda.is_available() else "cpu")

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