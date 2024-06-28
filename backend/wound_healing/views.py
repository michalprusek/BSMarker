from django.views.generic import ListView, DetailView, CreateView
from django.views.decorators.cache import cache_page

from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.decorators import login_required

from django.shortcuts import render, get_object_or_404

from django.http import HttpResponse
from django import forms

from .models import Project, Experiment, Frame
from .forms import ExperimentForm

import cv2 as cv


class ProjectList(LoginRequiredMixin, ListView):
    model = Project


class ProjectCreate(LoginRequiredMixin, CreateView):
    model = Project
    fields = ["name"]


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

    params = {
        "equalized": request.GET.get("equalized") == "True"
    }

    return img_response(frame.img(**params))
