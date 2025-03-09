from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.views.decorators.cache import cache_page

from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.decorators import login_required

from django.views.decorators.http import require_POST

from django.shortcuts import render, get_object_or_404
from django.urls import reverse_lazy

from django.http import HttpResponse
from django import forms

from .models import Project, Experiment, Frame

import cv2 as cv

import json


class ProjectList(LoginRequiredMixin, ListView):
    model = Project

    ordering = ["-pk"]


class ProjectCreate(LoginRequiredMixin, CreateView):
    model = Project
    fields = ["name"]


class ProjectView(LoginRequiredMixin, DetailView):
    model = Project
    pk_url_kwarg = "project"


class ProjectDelete(LoginRequiredMixin, DeleteView):
    model = Project
    success_url = reverse_lazy("project-list")


class ProjectUpdate(LoginRequiredMixin, UpdateView):
    model = Project
    fields = ["name"]


class ExperimentView(LoginRequiredMixin, DetailView):
    model = Experiment

    def get_queryset(self):
        return Experiment.objects.filter(project__pk=self.kwargs["project"])


class ExperimentCreate(LoginRequiredMixin, CreateView):
    model = Experiment
    fields = ["name"]

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if not kwargs.get("instance"):
            kwargs["instance"] = Experiment()

        kwargs["instance"].project = Project.objects.get(pk=self.kwargs["project"])
        return kwargs


class ExperimentUpdate(LoginRequiredMixin, UpdateView):
    model = Experiment
    fields = ["name", "project"]

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        if not kwargs.get("instance"):
            kwargs["instance"] = Experiment()

        kwargs["instance"].project = Project.objects.get(pk=self.kwargs["project"])
        return kwargs


class ExperimentDelete(LoginRequiredMixin, DeleteView):
    model = Experiment
    success_url = reverse_lazy("project-list")


def img_response(img):
    return HttpResponse(cv.imencode(".jpg", img)[1].tobytes(), content_type="image/jpeg")


@login_required
def preview(request, pk):
    experiment = get_object_or_404(Experiment, pk=pk)

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
def experiment_report(request, pk):
    fmt = request.GET.get("format", "csv")
    experiment = get_object_or_404(Experiment, pk=pk)
    rep = experiment.report(fmt)

    res = HttpResponse(rep)
    res['Content-Disposition'] = f"attachment; filename=report.{fmt}"

    return res


@login_required
def project_report(request, pk):
    fmt = request.GET.get("format", "csv")
    project = get_object_or_404(Project, pk=pk)
    rep = project.report(fmt)

    res = HttpResponse(rep)
    res['Content-Disposition'] = f"attachment; filename=report.{fmt}"

    return res


@login_required
@require_POST
def frame_upload(request, pk):
    experiment = get_object_or_404(Experiment, pk=pk)

    if "number" not in request.POST or not request.POST["number"].isdigit():
        return HttpResponse("missing number", status_code=400)

    num = int(request.POST["number"])
    file = request.FILES["file"]

    frame = Frame.objects.create(experiment=experiment, number=num, image=file)

    return HttpResponse(frame.pk)
