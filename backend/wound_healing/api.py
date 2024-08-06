import strawberry
from strawberry import auto
from strawberry.types import Info
from strawberry_django.optimizer import DjangoOptimizerExtension

from django.db import transaction

from . import models

import numpy as np


@strawberry.django.type(models.Project)
class Project:
    id: auto
    name: auto
    experiments: list["Experiment"]


@strawberry.django.type(models.Experiment)
class Experiment:
    id: auto
    name: auto
    project: Project
    frames: list["Frame"]

    @strawberry.django.field
    def url(self) -> str:
        return self.get_absolute_url()

    @strawberry.django.field
    def frame_count(self) -> int:
        return self.frames.count()


@strawberry.type
class FrameData:
    """
    FrameData does not have a database equivalent, 
    it is only a part of the API
    """

    # get_histogram is used to calculate the histogram lazily
    get_histogram: strawberry.Private[callable]
    
    url: str
    
    @strawberry.field
    def histogram(self, info: Info) -> list[int]:
        return self.get_histogram()


@strawberry.django.type(models.Frame, pagination=True)
class Frame:
    id: auto
    image: auto
    number: auto

    experiment: Experiment
    polygons: list["Polygon"]

    @strawberry.django.field
    def data(self, info: Info, equalized: bool = False) -> FrameData:
        return FrameData(
            url=self.img_url(equalized=equalized), 
            get_histogram=lambda: self.histogram(equalized=equalized)
        )


@strawberry.django.type(models.Polygon, pagination=True)
class Polygon:
    id: auto
    frame: Frame
    data: list[tuple[float, float]]
    operation: str
    surface: float


@strawberry.type
class Query:
    @strawberry.django.field
    def projects(self, info: Info) -> list[Project] | None:
        if not info.context.request.user.is_authenticated:
            return None
        return models.Project.objects.all()

    @strawberry.django.field
    def experiment(self, info: Info, id: strawberry.ID) -> Experiment | None:
        if not info.context.request.user.is_authenticated:
            return None
        return models.Experiment.objects.get(id=id)


@strawberry.type
class Mutation:
    @strawberry.django.mutation
    def create_polygon(self, info: Info, frame_id: strawberry.ID, data: list[tuple[float, float]]) -> Polygon | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (frame := models.Frame.objects.get(pk=frame_id)):
            return None

        poly = models.Polygon.objects.create(frame=frame, data=data)
        return poly

    @strawberry.django.mutation
    def delete_polygons(self, info: Info, ids: list[strawberry.ID]) -> bool:
        if not info.context.request.user.is_authenticated:
            return False
        if not (polygons := models.Polygon.objects.filter(pk__in=ids)):
            return False

        polygons.delete()
        return True

    @strawberry.django.mutation
    def update_polygon(self, info: Info, id: strawberry.ID, data: list[tuple[float, float]], operation: str) -> Polygon | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (polygon := models.Polygon.objects.filter(pk=id).first()):
            return None
        polygon.data = data
        polygon.operation = operation
        polygon.save()
        return polygon

    @strawberry.django.mutation
    def detect(self, info: Info, frame_id: strawberry.ID) -> Polygon | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (frame := models.Frame.objects.get(pk=frame_id)):
            return None

        return frame.detect()

    @strawberry.django.mutation
    def detect_free_cells(self, info: Info, frame_id: strawberry.ID) -> list[Polygon] | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (frame := models.Frame.objects.get(pk=frame_id)):
            return None

        return frame.detect_free_cells()

    @strawberry.django.mutation
    def detect_all(self, info: Info, experiment_id: strawberry.ID) -> list[Frame] | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (experiment := models.Experiment.objects.get(pk=experiment_id)):
            return None

        with transaction.atomic():
            for frame in experiment.frames.all():
                if not frame.polygons.exists():
                    frame.detect()

            return experiment.frames.all()

    @strawberry.django.mutation
    def detect_free_cells_all(self, info: Info, experiment_id: strawberry.ID) -> list[Frame] | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (experiment := models.Experiment.objects.get(pk=experiment_id)):
            return None

        with transaction.atomic():
            for frame in experiment.frames.all():
                frame.detect_free_cells()

            return experiment.frames.all()

    @strawberry.django.mutation
    def detect_full(self, info: Info, experiment_id: strawberry.ID) -> list[Frame] | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (experiment := models.Experiment.objects.get(pk=experiment_id)):
            return None

        with transaction.atomic():
            for frame in experiment.frames.all():
                frame.detect_full()

            return experiment.frames.all()

    @strawberry.django.mutation
    def clear_polys(self, info: Info, experiment_id: strawberry.ID) -> list[Frame] | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (experiment := models.Experiment.objects.get(pk=experiment_id)):
            return None

        with transaction.atomic():
            for frame in experiment.frames.all():
                frame.polygons.all().delete()

            return experiment.frames.all()


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    extensions=[
        DjangoOptimizerExtension,
    ],
)