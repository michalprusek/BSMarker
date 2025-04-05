import kagglehub
from pathlib import Path

import cv2 as cv
import numpy as np
import matplotlib.pyplot as plt

import wound


def walk(path):
	for dirpath, dirnames, filenames in path.walk():
		for fname in filenames:
			if fname.endswith(".jpg") or fname.endswith(".jpeg") or fname.endswith(".png"):
				yield dirpath / fname


def detect_classical(_, img):
	mask = np.zeros((img.shape[0], img.shape[1]), np.uint8)
	conts = wound.wound_contours(img)
	cells = wound.free_cells(img, conts)
	cv.fillPoly(mask, conts, 255)
	cv.fillPoly(mask, cells, 0)
	return mask > 0


def detect_classical_simple(_, img):
	return wound.wound_mask(img_orig) <= 0


def sam(orig, _):
	path = orig.parent.parent.parent / "sam_1_1" / orig.parent.name / (orig.stem + ".png")
	assert path.exists()
	return cv.imread(str(path), cv.IMREAD_GRAYSCALE) > 0


path = Path(kagglehub.dataset_download("katjalwenstein/woundhealing"))

original = sorted(list(walk(path / "woundhealing_v3" / "original")))
groundtruth = sorted(list(walk(path / "woundhealing_v3" / "groundtruth")))

methods = [detect_classical, detect_classical_simple, sam]
results = [[] for _ in methods]

for orig, truth in zip(original, groundtruth):
	assert orig.stem == truth.stem
	print(orig.name)

	img_orig = cv.imread(str(orig), cv.IMREAD_GRAYSCALE)
	img_truth = cv.imread(str(truth), cv.IMREAD_GRAYSCALE) > 0

	for i, fn in enumerate(methods):
		predicted = fn(orig, img_orig)
		iou = (img_truth * predicted).sum() / (img_truth | predicted).sum()
		results[i].append(iou)

print(np.array(results).mean(axis=1))

fig, ax = plt.subplots(len(results), sharex="col")
for i, r in enumerate(results):
	ax[i].hist(r)
plt.show()
