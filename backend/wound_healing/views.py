from django.views.generic import ListView, DetailView, CreateView, DeleteView
from django.views.decorators.cache import cache_page

from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.decorators import login_required

from django.shortcuts import render, get_object_or_404
from django.urls import reverse_lazy

from django.http import HttpResponse
from django import forms

from .models import Project, Experiment, Frame
from .forms import ExperimentForm

import cv2 as cv

import json


class ProjectList(LoginRequiredMixin, ListView):
    model = Project


class ProjectCreate(LoginRequiredMixin, CreateView):
    model = Project
    fields = ["name"]


class ProjectView(LoginRequiredMixin, DetailView):
    model = Project
    pk_url_kwarg = "project"


class ExperimentView(LoginRequiredMixin, DetailView):
    model = Experiment
    pk_url_kwarg = "experiment"

    def get_queryset(self):
        return Experiment.objects.filter(project__pk=self.kwargs["project"])


class ExperimentCreate(LoginRequiredMixin, CreateView):
    model = Experiment
    form_class = ExperimentForm

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if not kwargs.get("instance"):
            kwargs["instance"] = Experiment()

        kwargs["instance"].project = Project.objects.get(pk=self.kwargs["project"])
        return kwargs


class ExperimentDelete(DeleteView):
    model = Experiment
    success_url = reverse_lazy("project-list")


def img_response(img):
    return HttpResponse(cv.imencode(".jpg", img)[1].tobytes(), content_type="image/jpeg")


@login_required
def preview(request, epk):
    experiment = get_object_or_404(Experiment, pk=epk)

    img = experiment.frames.first().raw_img
    blurred = cv.medianBlur(img, 101)

    cv.putText(blurred, "Loading preview", (20, 50), cv.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 1, cv.LINE_AA)
    return img_response(blurred)


@login_required
def frame(request, pk):
    frame = get_object_or_404(Frame, pk=pk)

    lut_in = request.GET.get("lut_in")
    lut_out = request.GET.get("lut_out")

    params = {
        "equalized": request.GET.get("equalized") == "True",
        "lut_in": json.loads(lut_in) if lut_in else None,
        "lut_out": json.loads(lut_out) if lut_out else None,
    }

    return img_response(frame.img(**params))


@login_required
def report(request, epk):
    fmt = request.GET.get("format", "csv")
    experiment = get_object_or_404(Experiment, pk=epk)
    rep = experiment.report(fmt)

    res = HttpResponse(rep)
    res['Content-Disposition'] = f"attachment; filename=report.{fmt}"

    return res
