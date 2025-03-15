from django.core.management.base import BaseCommand
from django.conf import settings

from wound_healing.models import Frame

import pathlib
import json

import numpy as np
import tqdm


class Command(BaseCommand):
    help = "Dump all frames and additive polygons"

    def add_arguments(self, parser):
        parser.add_argument("out", nargs=1, type=pathlib.Path)

    def handle(self, *args, **options):
        if settings.CSRF_TRUSTED_ORIGINS:
            origin = settings.CSRF_TRUSTED_ORIGINS[0]
        else:
            origin = ""

        res = []
        for frame in tqdm.tqdm(Frame.objects.all()):
            res.append({
                "image": origin + frame.get_absolute_url(),
                "mask": origin + frame.get_absolute_url() + "?mask=True"
            })
        with options["out"][0].open("w") as f:
            json.dump(res, f)
