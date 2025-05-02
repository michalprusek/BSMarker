import torch
import torchvision
import numpy as np
import imageio.v3 as iio
import pathlib
import os


class SegmentationDataset(torch.utils.data.Dataset):
    def __init__(self, path, size):
        self.path = pathlib.Path(path)
        self.images = os.listdir(self.path / "images")
        self.size = size
        
    def __len__(self):
        return len(self.images)
            
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
            images.append(iio.imread(self.path / "images" / self.images[i]))
            masks.append(iio.imread(self.path / "masks" / self.images[i]))
        
        images = torch.tensor(np.array(images))
        masks = torch.tensor(np.array(masks))

        masks = masks > 0

        if self.size is not None:
	        images = torchvision.transforms.functional.resize(images, self.size)
	        masks = torchvision.transforms.functional.resize(masks, self.size)
        
        if single:
            return images, masks
        else:
            b, w, h = images.shape
            return (images.reshape(b, 1, w, h), masks.reshape(b, 1, w, h))


def load_dataset(dataset_path, size, val_ratio=0.1):
	dataset_path = pathlib.Path(dataset_path)
	train_dataset = SegmentationDataset(dataset_path / "train", size)
	test_dataset = SegmentationDataset(dataset_path / "test", size)

	val_size = int(np.ceil(val_ratio*len(train_dataset)))
	#test_size = int(np.ceil(test_ratio*len(dataset)))
	train_size = len(train_dataset)-val_size#-test_size

	return *torch.utils.data.random_split(train_dataset, [train_size, val_size]), test_dataset

