from django.views.generic import ListView, DetailView
from django.views.generic.edit import CreateView
from django.contrib.auth.mixins import LoginRequiredMixin

from django.shortcuts import render
from . import models


class ProjectList(LoginRequiredMixin, ListView):
    model = models.Project


class ExperimentView(LoginRequiredMixin, DetailView):
    model = models.Experiment
    slug_url_kwarg = "experiment"

    def get_queryset(self):
        return models.Experiment.objects.filter(project__slug=self.kwargs["project"])
