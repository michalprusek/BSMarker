import torch
import numpy as np
import matplotlib.pyplot as plt

from net import SegmentationModel
from dataset import load_dataset

SEED = 0
torch.manual_seed(SEED)
np.random.seed(SEED)

_, _, test_dataset = load_dataset("dataset/", (320, 320), 0.1, 0.1)


MODEL_PATH = "lightning_logs/version_18/checkpoints/epoch=24-step=200.ckpt"
model = SegmentationModel.load_from_checkpoint(MODEL_PATH, arch="unet", encoder_name="resnet34", T_max=0)
model.eval()

N = 5
fig, ax = plt.subplots(N, 3)

for i in range(N):
	mask = model(test_dataset[[i]][0].to("cuda"))
	ax[i, 0].imshow(mask[0].sigmoid().cpu().detach().numpy()[0] > 0.5)
	ax[i, 1].imshow(test_dataset[i][0][0])
	ax[i, 2].imshow(test_dataset[i][1][0])

plt.show()

