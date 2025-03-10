from django.core.management.base import BaseCommand
from wound_healing.models import Frame

import pathlib
import pickle

import tqdm


class Command(BaseCommand):
    help = "Dump all frames and additive polygons"

    def add_arguments(self, parser):
        parser.add_argument("out", nargs=1, type=pathlib.Path)

    def handle(self, *args, **options):
        res = []
        for frame in tqdm.tqdm(Frame.objects.all()):
            res.append({
                "image": frame.raw_img,
                "polygons": [
                    poly.data
                    for poly in frame.polygons.all()
                    if poly.operation == "+"
                ]
            })
        with options["out"][0].open("wb") as f:
            pickle.dump(res, f)
