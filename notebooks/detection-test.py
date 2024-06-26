import marimo

__generated_with = "0.6.20"
app = marimo.App(width="medium")


@app.cell
def __():
    import marimo as mo
    import cv2 as cv
    import numpy as np
    return cv, mo, np


@app.cell
def __(mo):
    frame_num = mo.ui.slider(1, 147)
    frame_num
    return frame_num,


@app.cell
def __(cv, frame_num, mo):
    img = cv.imread(f"../data/MiaPaca-2/Experiment_01_D5/MiaPaca-2_E01-D5_{frame_num.value:03}.jpg", cv.IMREAD_GRAYSCALE)
    mo.image(img, width=200)
    return img,


@app.cell
def __(cv, img, mo):
    img_blur = cv.blur(img, (3, 3))
    mo.image(img_blur, width=200)
    return img_blur,


@app.cell
def __(cv, img_blur, mo, np):
    def prewitt(img, thresh):
        temp = img.astype(np.float32)
        m1 = np.array( [[ -1, 0, 1 ], [ -1, 0, 1], [ -1, 0, 1]] )
        m2 = np.array( [[ -1, -1, 0 ], [ -1, 0, 1], [ 0, 1, 1]] )
        gx = cv.filter2D(img, ddepth=-1, kernel=m1)
        gy = cv.filter2D(img, ddepth=-1, kernel=np.transpose(m1))
        gd1 = cv.filter2D(img, ddepth=-1, kernel=m2)
        gd2 = cv.filter2D(img, ddepth=-1, kernel=np.rot90(m2))
        edges1 = np.hypot( gx, gy) >= thresh
        edges2 = np.hypot( gd1, gd2) >= thresh
        return (edges1 | edges2).astype(np.uint8) * 255

    edges = prewitt(img_blur, 10)
    mo.image(edges * 255, width=200)
    return edges, prewitt


@app.cell
def __(cv, edges, mo):
    img_morph = cv.morphologyEx(edges, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, (30, 30)))
    mo.image(img_morph, width=200)
    return img_morph,


@app.cell
def __(cv, img, img_morph, mo):
    contours, _ = cv.findContours(cv.bitwise_not(img_morph), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)
    largest_contour = max(contours, key=cv.contourArea)
    color_image = cv.cvtColor(img, cv.COLOR_GRAY2BGR)
    cv.drawContours(color_image, [largest_contour], -1, (0, 255, 0), 2)
    mo.image(color_image, width=200)
    return color_image, contours, largest_contour


if __name__ == "__main__":
    app.run()
