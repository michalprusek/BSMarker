import requests
from urllib.parse import urlparse
import pathlib
import shutil
import os
import tqdm
import random


URL = "https://healing.utia.cas.cz/"
USER = "admin"
PASS = "adminadmin"

DATASET = [
	["9f92f1d9-86d6-44ba-a8f8-e70ca486dd3a", slice(150)],        # U2OS, Ex 01
	["51da9a0f-e24b-4349-a2f4-b636ab026493", slice(25)],         # U2OS, Ex 02
	["863affc9-c57b-414a-acd3-16b409b3740c", slice(25)],         # U2OS, Ex 07

	["977f2bd2-f8b1-4eef-a580-e625040bace5", slice(None)],       # MiaPaca-2, Ex 01
	#["ca5a5496-6b97-4254-ad5d-1ce20f9d0dca", slice(None)],      # MiaPaca-2, Ex 02

	["a5272f7c-65d3-41c1-850d-8e8a365190b0", slice(52)],         # UFH-001, Control 2, Pozice 23
	#["47463950-fbbc-4b62-b412-c268aa135fc7", slice(None)],      # UFH-001, Control 3, Pozice 36

	["cc2f4a99-f614-4081-8a99-e292d2744ef1", slice(36)],         # MRC-5, E02_C6
	["cc2f4a99-f614-4081-8a99-e292d2744ef1", slice(31, 232, 20)],# MRC-5, E02_C6
	
	#["8f2d08e0-989d-47e2-aebe-ac5d1369d8d7", slice(None)],      # MRC-5, E02_D6
]
DATASET_PATH = pathlib.Path("dataset/")
IMAGE_DIR = "images"
MASK_DIR = "masks"


def init_paths():
	if not os.path.exists(DATASET_PATH):
		os.makedirs(DATASET_PATH, exist_ok=True)
		for subset in ["train", "test"]:
			os.makedirs(DATASET_PATH / subset, exist_ok=True)
			os.makedirs(DATASET_PATH / subset / IMAGE_DIR, exist_ok=True)
			os.makedirs(DATASET_PATH / subset / MASK_DIR, exist_ok=True)
	assert URL.endswith("/")


def fetch_experiment(s, eid):
	s.post(URL + "graphql/", json={"query": "mutation { login(username: \"" + USER + "\", password: \"" + PASS + "\") { username } }"})
	query = """
	{
      experiment(id: \"""" + eid + """\") {
        name,
        frames {
          number,
          image: data {
            url
          },
          mask: data(mask: true) {
            url
          }
        }
      }
	}"""
	res = s.post(URL + "graphql/", json={"query": query})
	assert res.json()["data"] is not None, query + "\nerror: " + repr(res.json()["errors"])

	return res.json()["data"]["experiment"]


def main(seed=42):
	random.seed(seed)
	init_paths()
	s = requests.Session()

	triplets = []
	for eid, sl in DATASET:
		experiment = fetch_experiment(s, eid)

		print(f"Experiment {experiment["name"]}")
		for frame in experiment["frames"][sl]:
			fname = f"{experiment["name"]}_{frame["number"]:03}.jpg"
			triplets.append((fname, URL + frame["image"]["url"], URL + frame["mask"]["url"]))

	random.shuffle(triplets)
	test = triplets[:int(0.1 * len(triplets))]
	train = triplets[int(0.1 * len(triplets)):]

	for subset, frames in [("train", train), ("test", test)]:
		for frame in tqdm.tqdm(frames):
			res = s.get(frame[1], stream=True)
			with open(DATASET_PATH / subset / IMAGE_DIR / frame[0], "wb") as file:
				shutil.copyfileobj(res.raw, file)

			res = s.get(frame[2], stream=True)
			with open(DATASET_PATH / subset / MASK_DIR / frame[0], "wb") as file:
				shutil.copyfileobj(res.raw, file)


if __name__ == "__main__":
	main()
