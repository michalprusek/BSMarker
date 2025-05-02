from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent / "unet"))

from functools import partial

import cv2 as cv
import imageio.v3 as iio
import numpy as np
import tqdm

from unet.infer import detect
import segmentation_models_pytorch as smp
import albumentations as A
import torch
import wound


def walk(path):
	for dirpath, dirnames, filenames in path.walk():
		for fname in filenames:
			if fname.endswith(".jpg") or fname.endswith(".jpeg") or fname.endswith(".png"):
				yield dirpath / fname


def detect_classical(img, mask_truth):
	mask = np.zeros((img.shape[0], img.shape[1]), np.uint8)
	conts = wound.wound_contours(img)
	cells = wound.free_cells(img, conts)
	cv.fillPoly(mask, conts, 255)
	cv.fillPoly(mask, cells, 0)
	return mask > 0, mask_truth


def detect_classical_simple(img):
	return wound.wound_mask(img) <= 0


def unet(img, mask_truth, model_name):
	transform = A.Compose([
		A.Resize(256, 256, p=1),
	])
	t = transform(image=img, mask=mask_truth.astype(np.uint8))

	mask = detect(t["image"], model_name) > 0
	return mask, t["mask"] > 0


def our_test():
	path = Path("unet/dataset/test/")
	original = sorted(list(walk(path / "images")))
	groundtruth = sorted(list(walk(path / "masks")))
	return original, groundtruth

def sinitica():
	path = Path("MCF-7 cell populations Dataset/")
	original = sorted(list(walk(path / "images")))
	groundtruth = sorted(list(walk(path / "masks")))
	return original, groundtruth

def lowenstein():
	import kagglehub
	path = Path(kagglehub.dataset_download("katjalwenstein/woundhealing"))
	original = sorted(list(walk(path / "woundhealing_v3" / "original")))
	groundtruth = sorted(list(walk(path / "woundhealing_v3" / "groundtruth")))
	return original, groundtruth

original, groundtruth = our_test()

methods = [
	["detect_classical", detect_classical], 
	["unet (no augment)", partial(unet, model_name="noaugment/version_0")], 
	["unet (heavy augment)", partial(unet, model_name="heavy_augment/version_0")],
]
results = [[] for _ in methods]

for orig, truth in zip(tqdm.tqdm(list(original)), groundtruth):
	assert orig.stem == truth.stem

	img_orig = iio.imread(str(orig))
	mask_orig = iio.imread(str(truth)) > 0

	if len(img_orig.shape) > 2 and img_orig.shape[-1] == 3:
		img_orig = cv.cvtColor(img_orig, cv.COLOR_BGR2GRAY)
	if len(mask_orig.shape) > 2:
		mask_orig = mask_orig[:, :, 0]

	for i, (_, method) in enumerate(methods):
		predicted, mask_truth = method(img_orig, mask_orig)

		err = abs(mask_truth.sum()-predicted.sum())/(mask_truth.shape[0] * mask_truth.shape[1])

		tp, fp, fn, tn = smp.metrics.get_stats(
			torch.tensor(predicted).long()[None, None, :, :], torch.tensor(mask_truth).long()[None, None, :, :], mode="binary"
		)

		results[i].append({"tp": tp, "fp": fp, "fn": fn, "tn": tn, "err": err})


print("method" + " "*19 + "\tdataset iou\tper img iou\tavg err")
for (method, _), res in zip(methods, results):#, "detect_classical_simple"
	tp = torch.cat([x["tp"] for x in res])
	fp = torch.cat([x["fp"] for x in res])
	fn = torch.cat([x["fn"] for x in res])
	tn = torch.cat([x["tn"] for x in res])
	err = np.array([x["err"] for x in res])

	per_image_iou = smp.metrics.iou_score(
		tp, fp, fn, tn, reduction="micro-imagewise"
	)
	dataset_iou = smp.metrics.iou_score(tp, fp, fn, tn, reduction="micro")

	print(f"{method:<25}\t{float(dataset_iou)*100:0.8f}%\t{float(per_image_iou)*100:0.8f}%\t{float(err.mean())*100}%")


#import matplotlib.pyplot as plt
#fig, ax = plt.subplots(len(results), sharex="col")
#for i, r in enumerate(results):
#	ax[i].hist(r)
#plt.show()
