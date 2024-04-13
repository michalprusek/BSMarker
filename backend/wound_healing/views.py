from django.views.generic import DetailView
from django.shortcuts import render
from . import models


class ExperimentView(DetailView):
    model = models.Experiment
    slug_url_kwarg = "experiment"

    def get_queryset(self):
        return models.Experiment.objects.filter(project__slug=self.kwargs["project"])
