"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.conf import settings

from wound_healing import views
from strawberry.django.views import GraphQLView
from wound_healing.api import schema


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.ProjectList.as_view(), name="project-list"),

    path('project/new', views.ProjectCreate.as_view(), name="project-create"),

    path('project/<int:project>/experiment/<int:experiment>', views.ExperimentView.as_view(), name="experiment-detail"),
    path('project/<int:project>/experiment/new', views.ExperimentCreate.as_view(), name="experiment-create"),
    
    path('preview/<int:epk>/', views.preview, name="experiment-preview"),
    path('frame/<int:pk>/', views.frame, name="frame-view"),

    path("graphql/", GraphQLView.as_view(schema=schema)),
]

if settings.DEBUG:
    from django.conf.urls.static import static

    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
