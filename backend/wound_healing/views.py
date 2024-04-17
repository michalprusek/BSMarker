from django.views.generic import ListView, DetailView, CreateView
from django.contrib.auth.mixins import LoginRequiredMixin
from django import forms 

from django.shortcuts import render
from .models import Project, Experiment
from .forms import ExperimentForm


class ProjectList(LoginRequiredMixin, ListView):
    model = Project


class ExperimentView(LoginRequiredMixin, DetailView):
    model = Experiment
    slug_url_kwarg = "experiment"

    def get_queryset(self):
        return Experiment.objects.filter(project__slug=self.kwargs["project"])


class ExperimentCreate(LoginRequiredMixin, CreateView):
    model = Experiment
    form_class = ExperimentForm

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if not kwargs.get("instance"):
            kwargs["instance"] = Experiment()

        kwargs["instance"].project = Project.objects.get(slug=self.kwargs["project"])
        return kwargs
