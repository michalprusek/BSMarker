import torch.nn as nn
import torch

import torchvision


def double_conv(n_in, n_out):
	return nn.Sequential(
		nn.Conv2d(n_in, n_out, kernel_size=3, padding=1),
		nn.BatchNorm2d(n_out),
		nn.ReLU(inplace=True),
		nn.Conv2d(n_out, n_out, kernel_size=3, padding=1),
		nn.BatchNorm2d(n_out),
		nn.ReLU(inplace=True),
	)


class DownBlock(nn.Module):
	def __init__(self, n_in, n_out):
		super().__init__()

		self.conv = double_conv(n_in, n_out)
		self.pool = nn.MaxPool2d(2)

	def forward(self, x):
		y = self.conv(x)
		return self.pool(y), y


class UpBlock(nn.Module):
	def __init__(self, n_in, n_out, interp="bilinear"):
		super().__init__()

		self.up = nn.Upsample(scale_factor=2, mode=interp)
		self.conv = double_conv(2*n_in, n_out)

	def forward(self, x, bl):
		bl = torchvision.transforms.functional.center_crop(bl, x.shape[2:])
		return self.conv(self.up(torch.cat([x, bl], dim=1)))


class Unet(nn.Module):
	def __init__(self, sizes=None):
		super().__init__()

		self.sizes = sizes or [1, 64, 128]

		self.enc = nn.ModuleList([DownBlock(a, b) for a, b in zip(self.sizes, self.sizes[1:])])
		self.middle = double_conv(self.sizes[-1], self.sizes[-1])
		self.dec = nn.ModuleList([UpBlock(a, b) for a, b in zip(reversed(self.sizes), reversed(self.sizes[:-1]))])
		self.final = nn.Conv2d(1, 1, kernel_size=1)

	def forward(self, x):
		backlinks = []

		for down in self.enc:
			x, bl = down(x)
			backlinks.append(bl)

		x = self.middle(x)

		for up, bl in zip(self.dec, reversed(backlinks)):
			x = up(x, bl)

		return self.final(x)

