import torch
import torchvision
from arch import Unet
import numpy as np
import pickle

import imageio.v3 as iio
import matplotlib.pyplot as plt


SIZE = (64, 64)


model = torch.load("model.pth", weights_only=False)
model.eval()

imgs = torch.tensor(np.array([
	iio.imread("test1.jpg"),
	iio.imread("test2.jpg"),
	iio.imread("http://localhost:8000/frame/f80663d7-f49d-4f27-8b33-4a5ba8895df8/"),
	iio.imread("http://localhost:8000/frame/addf8349-c7d8-43be-bdfe-25d610a8ebde/"),
]))/255
imgs = torchvision.transforms.functional.resize(imgs/255, SIZE)
imgs = imgs.reshape(imgs.shape[0], 1, imgs.shape[1], imgs.shape[2])

print(imgs.shape)
masks = model(imgs).detach().numpy()
print(masks.shape)

nplots = len(imgs)
fig, ax = plt.subplots(nplots, 2)
for i in range(nplots):
	ax[i, 0].imshow(masks[i][0])
	ax[i, 1].imshow(imgs[i][0])
plt.show()
