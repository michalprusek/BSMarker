import torch
import torch.nn.functional as F
import torchvision
from arch import Unet
import numpy as np
import pickle

import imageio.v3 as iio
import matplotlib.pyplot as plt


SIZE = (64, 64)


device = "cuda" if torch.cuda.is_available() else "cpu"


model = torch.load("model.pth", weights_only=False)
model.to(device)
model.eval()

urls = [
	"http://193.86.114.62:8000/frame/f80663d7-f49d-4f27-8b33-4a5ba8895df8/",
	"http://193.86.114.62:8000/frame/addf8349-c7d8-43be-bdfe-25d610a8ebde/",
	"http://193.86.114.62:8000/frame/a0624f3c-227d-4867-8931-9a1f0a889419/"
]

imgs = torch.tensor(np.array([
	iio.imread(u) for u in urls
]))/255
true_masks = torch.tensor(np.array([
	iio.imread(u + "?mask=True") for u in urls
]))/255
true_masks = torchvision.transforms.functional.resize(true_masks, SIZE)
imgs = torchvision.transforms.functional.resize(imgs, SIZE)
imgs = imgs.reshape(imgs.shape[0], 1, imgs.shape[1], imgs.shape[2]).to(device)

print(imgs.shape)
masks = F.sigmoid(model(imgs)) > 0.5
print(masks.shape)

nplots = len(imgs)
fig, ax = plt.subplots(nplots, 3)
masks_cpu = masks.cpu().detach().numpy()
imgs_cpu = imgs.cpu().detach().numpy()
for i in range(nplots):
	ax[i, 0].imshow(masks_cpu[i][0])
	ax[i, 1].imshow(imgs_cpu[i][0])
	ax[i, 2].imshow(true_masks[i])
plt.show()
