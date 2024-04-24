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

    @strawberry.django.field
    def data_url(self) -> str:
        return "data:image/jpeg;base64," + base64.b64encode(self.jpg).decode()


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


schema = strawberry.Schema(
    query=Query,
    extensions=[
        DjangoOptimizerExtension,
    ],
)