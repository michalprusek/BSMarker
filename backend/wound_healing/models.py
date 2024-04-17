from django.db import models

from django.template.defaultfilters import slugify
from django.urls import reverse


class Project(models.Model):
    name = models.CharField(max_length=1024)
    slug = models.SlugField(editable=False)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Experiment(models.Model):
    project = models.ForeignKey(Project, related_name="experiments", on_delete=models.CASCADE)
    name = models.CharField(max_length=1024)
    slug = models.SlugField(editable=False)

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
    polygon = models.JSONField(null=True, editable=False)

    @property
    def histogram(self):
        import numpy as np
        import cv2 as cv

        with self.image.open() as f:
            img = cv.imdecode(np.frombuffer(f.read(), np.uint8), cv.IMREAD_UNCHANGED)

        hist = np.bincount(img.ravel(), minlength=256)
        return hist
