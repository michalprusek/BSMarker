from django.contrib import admin
from . import models


admin.site.register(models.Project)
admin.site.register(models.Experiment)

class FrameAdmin(admin.ModelAdmin):
    list_filter = [
        ("experiment", admin.RelatedOnlyFieldListFilter),
    ]

admin.site.register(models.Frame, FrameAdmin)
admin.site.register(models.Polygon)
