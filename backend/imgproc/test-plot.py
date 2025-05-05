from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent / "unet"))

import cv2 as cv
import imageio.v3 as iio
import numpy as np
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib
matplotlib.rc("font", size=5)

from unet.infer import detect


def walk(path):
	for dirpath, dirnames, filenames in path.walk():
		for fname in filenames:
			if fname.endswith(".jpg") or fname.endswith(".jpeg") or fname.endswith(".png"):
				yield dirpath / fname


def our_test():
	path = Path("/home/veskrna/wound-healing/backend/imgproc/unet/dataset/test/")
	original = sorted(list(walk(path / "images")))
	groundtruth = sorted(list(walk(path / "masks")))
	return original, groundtruth

def sinitica():
	path = Path("/home/veskrna/wound-healing/backend/imgproc/MCF-7 cell populations Dataset/")
	original = sorted(list(walk(path / "images")))
	groundtruth = sorted(list(walk(path / "masks")))
	return original, groundtruth

def lowenstein():
	import kagglehub
	path = Path(kagglehub.dataset_download("katjalwenstein/woundhealing"))
	original = sorted(list(walk(path / "woundhealing_v3" / "original")))
	groundtruth = sorted(list(walk(path / "woundhealing_v3" / "groundtruth")))
	return original, groundtruth


N = 6
fig, ax = plt.subplots(N, 5)

original = []
groundtruth = []

o, gt = our_test()
for i in [0, 30, 40]:
	original.append(o[i])
	groundtruth.append(gt[i])
o, gt = lowenstein()
for i in [0, 5, 10]:
	original.append(o[i])
	groundtruth.append(gt[i])


for i, (orig, truth) in enumerate(zip(list(original)[:N], groundtruth)):
	assert orig.stem == truth.stem

	img_orig = iio.imread(str(orig))
	mask_orig = iio.imread(str(truth)) > 0

	if len(img_orig.shape) > 2 and img_orig.shape[-1] == 3:
		img_orig = cv.cvtColor(img_orig, cv.COLOR_BGR2GRAY)
	if len(mask_orig.shape) > 2:
		mask_orig = mask_orig[:, :, 0]

	ax[i, 0].imshow(img_orig, cmap="grey")
	ax[i, 1].imshow(cv.equalizeHist(img_orig), cmap="grey")
	ax[i, 2].imshow(mask_orig)
	ax[i, 3].imshow(cv.resize(detect(img_orig, "heavy_augment/version_0").astype(np.uint8), (img_orig.shape[1], img_orig.shape[0])))
	ax[i, 4].imshow(cv.resize(detect(img_orig, "heavy_augment/version_0", thresh=None), (img_orig.shape[1], img_orig.shape[0])))

	for j in range(5):
		ax[i, j].set_xticks([])
		ax[i, j].set_yticks([])

ax[0, 0].set_title("Original")
ax[0, 1].set_title("Equalized")
ax[0, 2].set_title("Ground Truth")
ax[0, 3].set_title("Detection")
ax[0, 4].set_title("Probabilities")
plt.tight_layout()

plt.savefig("unet.pdf", dpi=800, bbox_inches="tight")
#plt.show()

