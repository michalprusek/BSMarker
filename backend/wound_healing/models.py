from django.db import models

from django.core.cache import cache

from django.template.defaultfilters import slugify
from django.urls import reverse

import numpy as np
import cv2 as cv


class Project(models.Model):
    name = models.CharField(max_length=1024)
    slug = models.SlugField(editable=False, unique=True)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Experiment(models.Model):
    project = models.ForeignKey(Project, related_name="experiments", on_delete=models.CASCADE)
    name = models.CharField(max_length=1024)
    slug = models.SlugField(editable=False, unique=True)

    def __str__(self):
        return f"{self.project.name}_{self.name}"

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("experiment-detail", kwargs={"experiment": self.slug, "project": self.project.slug})


class Frame(models.Model):
    def upload_to(instance, filename):
        return f"{instance.experiment.project.slug}/{instance.experiment.slug}/{filename}"

    def __str__(self):
        return f"{self.experiment}_{self.number:03}"

    experiment = models.ForeignKey(Experiment, related_name="frames", on_delete=models.CASCADE)
    number = models.PositiveIntegerField()
    image = models.ImageField(upload_to=upload_to)

    class Meta:
        unique_together = [("experiment", "number")]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._img = None
        self._original = True

    @property
    def img(self):
        if self._img is None:
            with self.image.open() as f:
                self._img = cv.imdecode(np.frombuffer(f.read(), np.uint8), cv.IMREAD_UNCHANGED)
        return self._img

    @img.setter
    def img(self, val):
        self._img = val
        self._original = False

    def eqhist(self):
        self.img = cv.equalizeHist(self.img)

    @property
    def jpg(self):
        return cv.imencode(".jpg", self.img)[1]

    @property
    def hist_cache_key(self):
        return f"histogram-{self.pk}"

    @property
    def histogram(self):
        if not self._original or (hist := cache.get(self.hist_cache_key)) is None:
            hist = np.bincount(self.img.ravel(), minlength=256)

            if self._original:
                cache.set(self.hist_cache_key, hist, None)
        
        return hist


class Polygon(models.Model):
    frame = models.ForeignKey(Frame, related_name="polygons", on_delete=models.CASCADE)
    data = models.JSONField()
