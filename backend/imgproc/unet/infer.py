import torch
import numpy as np
import matplotlib.pyplot as plt
import torchvision
import functools
import random
import os

from net import SegmentationModel
torch.set_float32_matmul_precision("medium")


SIZE = (256, 256)

LOG_DIR = "/home/veskrna/wound-healing/backend/imgproc/unet/lightning_logs"


@functools.cache
def get_model(model_name, encoder):
	ckpt_name = os.listdir(f"{LOG_DIR}/{model_name}/checkpoints/")[0]
	model_path = f"{LOG_DIR}/{model_name}/checkpoints/{ckpt_name}"
	model = SegmentationModel.load_from_checkpoint(model_path, arch="unet", encoder_name=encoder, T_max=54300)
	model.eval()
	return model


def detect(img, model_name, encoder="resnet50", thresh=0.5):
	with torch.no_grad():
		model = get_model(model_name, encoder)

		img = torchvision.transforms.functional.resize(torch.tensor(img[None, None, :, :]), (256, 256))
		img = img.to("cuda")

		masks = model(img).sigmoid()[0, 0].cpu().detach().numpy()
		if thresh is not None:
			masks = masks > thresh

		return masks


if __name__ == "__main__":
	import argparse
	import imageio.v3 as iio
	import cv2 as cv

	parser = argparse.ArgumentParser()
	parser.add_argument("infile")
	parser.add_argument("outfile")
	parser.add_argument("-m", "--model", default="heavy_augment/version_0")
	parser.add_argument("-e", "--encoder", default="resnet50")
	args = parser.parse_args()

	img = iio.imread(args.infile)
	if len(img.shape) > 2 and img.shape[-1] == 3:
		img = cv.cvtColor(img, cv.COLOR_BGR2GRAY)

	mask = detect(img, args.model, args.encoder)
	iio.imwrite(args.outfile, mask)
