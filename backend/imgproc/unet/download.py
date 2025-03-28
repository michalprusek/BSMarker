import requests
from urllib.parse import urlparse
import pathlib
import shutil
import os
import tqdm


URL = "http://193.86.114.62:8000/"
USER = "admin"
PASS = "adminadmin"
PROJECT_ID = "5b622c5b-4853-4e77-99b1-87e1f566507a"
DATASET_PATH = pathlib.Path("dataset/")
IMAGE_DIR = "imgs"
MASK_DIR = "masks"


if not os.path.exists(DATASET_PATH):
	os.makedirs(DATASET_PATH, exist_ok=True)
	os.makedirs(DATASET_PATH / IMAGE_DIR, exist_ok=True)
	os.makedirs(DATASET_PATH / MASK_DIR, exist_ok=True)
assert URL.endswith("/")

s = requests.Session()
s.post(URL + "graphql/", json={"query": "mutation { login(username: \"" + USER + "\", password: \"" + PASS + "\") { username } }"})
res = s.post(URL + "graphql/", json={"query": """
{
  project(id: \"""" + PROJECT_ID + """\") {
    experiments {
      name,
      frames {
        id,
        image: data {
          url
        },
        mask: data(mask: true) {
          url
        }
      }
    }
  }
}"""
})
experiments = res.json()["data"]["project"]["experiments"]

for experiment in experiments:
	print(f"Experiment {experiment['name']}")
	for frame in tqdm.tqdm(experiment["frames"]):
		fname = os.path.basename(urlparse(frame["image"]["url"]).path)
		if not fname:
			fname = frame["id"] + ".jpg"

		res = s.get(URL + frame["image"]["url"], stream=True)
		with open(DATASET_PATH / IMAGE_DIR / fname, "wb") as file:
			shutil.copyfileobj(res.raw, file)

		res = s.get(URL + frame["mask"]["url"], stream=True)
		with open(DATASET_PATH / MASK_DIR / fname, "wb") as file:
			shutil.copyfileobj(res.raw, file)
