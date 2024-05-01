import strawberry
from strawberry import auto
from strawberry.types import Info
from strawberry_django.optimizer import DjangoOptimizerExtension

from . import models

import base64


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

    @strawberry.django.field
    def modified_frame(self, num: int, eqhist: bool=False) -> "Frame":
        frame = self.frames.get(number=num)

        if eqhist:
            frame.eqhist()

        return frame


@strawberry.django.type(models.Frame, pagination=True)
class Frame:
    id: auto
    image: auto
    histogram: list[int]

    experiment: Experiment
    polygons: list["Polygon"]

    @strawberry.django.field
    def data_url(self) -> str:
        return "data:image/jpeg;base64," + base64.b64encode(self.jpg).decode()


@strawberry.django.type(models.Polygon, pagination=True)
class Polygon:
    id: auto
    frame: Frame
    data: list[tuple[float, float]]


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
    def update_polygon(self, info: Info, id: strawberry.ID, data: list[tuple[float, float]]) -> Polygon | None:
        if not info.context.request.user.is_authenticated:
            return None
        if not (polygon := models.Polygon.objects.get(pk=id)):
            return None
        polygon.data = data
        polygon.save()
        return polygon


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    extensions=[
        DjangoOptimizerExtension,
    ],
)