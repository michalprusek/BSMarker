from django.db import models

from django.template.defaultfilters import slugify
from django.urls import reverse

import numpy as np
import cv2 as cv

from imgproc.wound import wound_contour


class Project(models.Model):
    name = models.CharField(max_length=1024)

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse("project-list") + f"#project-{self.pk}"


class Experiment(models.Model):
    project = models.ForeignKey(Project, related_name="experiments", on_delete=models.CASCADE)
    name = models.CharField(max_length=1024)

    def __str__(self):
        return f"{self.project.name}_{self.name}"

    def get_absolute_url(self):
        return reverse("experiment-detail", kwargs={"project": self.project.pk, "experiment": self.pk})


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
        ordering = ["experiment", "number"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._img = None

    @property
    def raw_img(self):
        if self._img is None:
            with self.image.open() as f:
                self._img = cv.imdecode(np.frombuffer(f.read(), np.uint8), cv.IMREAD_UNCHANGED)
        return self._img

    def get_absolute_url(self):
        from django.urls import reverse

        return reverse("frame-view", kwargs={"pk": self.pk})

    def img(self, equalized=False):
        res = self.raw_img

        if equalized:
            res = cv.equalizeHist(res)

        return res

    def img_and_histogram(self, **kwargs):
        image = self.img(**kwargs)
        hist = np.bincount(image.ravel(), minlength=256)
        return image, hist

    def histogram(self, **kwargs):
        return self.img_and_histogram(**kwargs)[1]

    def img_url(self, **kwargs):
        import urllib.parse

        return self.get_absolute_url() + ("?" + urllib.parse.urlencode(kwargs) if kwargs else "")

    def detect(self):
        img = self.img()

        contour = wound_contour(img, approx=2).astype(np.float64)
        contour[:, 0] /= img.shape[0]
        contour[:, 1] /= img.shape[1]

        return Polygon.objects.create(frame=self, data=contour.tolist())


class Polygon(models.Model):
    frame = models.ForeignKey(Frame, related_name="polygons", on_delete=models.CASCADE)
    data = models.JSONField()

    @property
    def surface(self):
        points = np.array(self.data, dtype=np.float32)
        points[:, 0] *= self.frame.image.width
        points[:, 1] *= self.frame.image.height
        return cv.contourArea(points)
