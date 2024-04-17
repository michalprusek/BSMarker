from django import forms
from .models import Experiment, Frame


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleImageField(forms.ImageField):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", MultipleFileInput())
        super().__init__(*args, **kwargs)

    def clean(self, data, initial=None):
        single_file_clean = super().clean
        if isinstance(data, (list, tuple)):
            result = [single_file_clean(d, initial) for d in data]
        else:
            result = single_file_clean(data, initial)
        return result


class ExperimentForm(forms.ModelForm):
    images = MultipleImageField()

    def save(self, commit=True):
        instance = super().save(commit=False)

        save_m2m_prev = self.save_m2m
        def save_m2m():
            save_m2m_prev()

            for idx, image in enumerate(self.cleaned_data["images"]):
                instance.frames.add(Frame.objects.create(experiment=instance, number=idx+1, image=image))
        self.save_m2m = save_m2m

        if commit:
            instance.save()
            self.save_m2m()

        return instance

    class Meta:
        model = Experiment
        fields = ["name", "images"]
