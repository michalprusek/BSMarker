import requests
from urllib.parse import urlparse
import pathlib
import shutil
import os
import tqdm


URL = ""
USER = "admin"
PASS = "adminadmin"

DATASET = [
	("train", [
		["9f92f1d9-86d6-44ba-a8f8-e70ca486dd3a", slice(150)],        # U2OS, Ex 01
		["9f0accb0-5479-48a7-bcac-9645a7f17a3b", slice(25)],         # U2OS, Ex 14

		["ca5a5496-6b97-4254-ad5d-1ce20f9d0dca", slice(None)],       # MiaPaca-2, Ex 02

		["a5272f7c-65d3-41c1-850d-8e8a365190b0", slice(42)],         # UFH-001, E02_C6

		["cc2f4a99-f614-4081-8a99-e292d2744ef1", slice(28)],         # MRC-5, E02_C6
		["cc2f4a99-f614-4081-8a99-e292d2744ef1", slice(30, 231, 20)],# MRC-5, E02_C6
	]),
	("test", [
		["977f2bd2-f8b1-4eef-a580-e625040bace5", slice(None)],       # MiaPaca-2, Ex 01
	]),
]
DATASET_PATH = pathlib.Path("dataset/")
IMAGE_DIR = "images"
MASK_DIR = "masks"


def init_paths():
	if not os.path.exists(DATASET_PATH):
		os.makedirs(DATASET_PATH, exist_ok=True)
		for subset, _ in DATASET:
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


def main():
	init_paths()
	s = requests.Session()

	for subset, composition in DATASET:
		for eid, sl in composition:
			experiment = fetch_experiment(s, eid)

			print(f"Experiment {experiment["name"]}")
			for frame in tqdm.tqdm(experiment["frames"][sl]):
				fname = f"{experiment["name"]}_{frame["number"]:03}.jpg"

				res = s.get(URL + frame["image"]["url"], stream=True)
				with open(DATASET_PATH / subset / IMAGE_DIR / fname, "wb") as file:
					shutil.copyfileobj(res.raw, file)

				res = s.get(URL + frame["mask"]["url"], stream=True)
				with open(DATASET_PATH / subset / MASK_DIR / fname, "wb") as file:
					shutil.copyfileobj(res.raw, file)


if __name__ == "__main__":
	main()
