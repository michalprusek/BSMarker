from django.core.management.base import BaseCommand
from wound_healing.models import Frame

import pathlib
import pickle

import numpy as np
import tqdm


class Command(BaseCommand):
    help = "Dump all frames and additive polygons"

    def add_arguments(self, parser):
        parser.add_argument("out", nargs=1, type=pathlib.Path)

    def handle(self, *args, **options):
        res = []
        for frame in tqdm.tqdm(Frame.objects.all()):
            mask = np.zeros_like(frame.raw_img, dtype=np.uint8)
            for poly in frame.polygons.all():
                if poly.operation == "+":
                    mask |= poly.mask() == 255
                elif poly.operation == "-":
                    mask &= poly.mask() != 255
            mask *= 255

            res.append({
                "image": frame.raw_img,
                "mask": mask
            })
        with options["out"][0].open("wb") as f:
            pickle.dump(res, f)
