import marimo

__generated_with = "0.6.20"
app = marimo.App(width="medium")


@app.cell
def __():
    import cv2 as cv
    import marimo as mo
    import numpy as np
    return cv, mo, np


@app.cell
def __(cv, mo):
    img = cv.imread("../data/MiaPaca-2/Experiment_01_D5/MiaPaca-2_E01-D5_037.jpg")
    print(img.shape)
    mo.image(img, width=200)
    return img,


@app.cell
def __(cv, img):
    new_size = (2048, 2048)

    img_ = cv.resize(img, new_size)
    return img_, new_size


@app.cell
def __(mo, new_size):
    ui = mo.ui.array([
        mo.ui.slider(0, new_size[1], value=int(400/2048 * new_size[1])),
        mo.ui.slider(0, new_size[1], value=int(1300/2048 * new_size[1]))
    ])
    mo.md(f"""
    Use the sliders to edit the target area:

    |  |  |
    | - | - |
    | Top:  | {ui[0]} |
    | Bottom:  | {ui[1]} |
    """)
    return ui,


@app.cell
def __(cv, img_, mo, new_size, ui):
    rect = (0, ui.value[0], new_size[0], ui.value[1])
    print(rect)
    mo.image(cv.rectangle(img_.copy(), (rect[0], rect[1]), (rect[2], rect[3]), color=(255, 0, 0), thickness=5), width=200)
    return rect,


@app.cell
def __(cv, img_, mo, np, rect):
    bgModel = np.zeros((1,65), np.float64)
    fgModel = np.zeros((1,65), np.float64)
    mask = np.zeros(img_.shape[:2], np.uint8)

    mask, bgModel, fgModel, cv.grabCut(img_, mask, rect, bgModel, fgModel, 5, cv.GC_INIT_WITH_RECT)

    mask2 = np.where((mask==2) | (mask==0), 0, 1).astype(np.uint8)
    mo.image(mask2, width=200)
    return bgModel, fgModel, mask, mask2


@app.cell
def __(cv, img_, mask2, mo):
    contours, hierarchy = cv.findContours(mask2, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE)
    mo.image(cv.drawContours(img_.copy(), contours[0], -1, (0, 255, 0), 3), width=200)
    return contours, hierarchy


@app.cell
def __():
    return


if __name__ == "__main__":
    app.run()
