import marimo

__generated_with = "0.9.14"
app = marimo.App(width="medium")


@app.cell
def __():
    import marimo as mo
    import cv2 as cv
    import numpy as np

    def show(*args):
        if not args:
            return mo.Html("")
        return mo.md("{} {}".format(mo.image(args[0], width=200), show(*args[1:])))
    return cv, mo, np, show


@app.cell
def __():
    #experiment_path = "../data/MRC-5/Experiment_02_C6/MRC-5_E02-C6_{val:03}.jpg"
    #frame_count = 259

    #experiment_path = "../data/MiaPaca-2/Experiment_01_D5/MiaPaca-2_E01-D5_{val:03}.jpg"
    #frame_count = 147

    experiment_path = "../backend/data/U2OS/Neošetřené_Pozice_1/Experiment_01_current_Default_observation_T{val:04}.png"
    frame_count = 1382
    return experiment_path, frame_count


@app.cell
def __(frame_count, mo):
    frame_num = mo.ui.slider(1, frame_count, value=409)
    frame_num
    return (frame_num,)


@app.cell
def __(cv, experiment_path, frame_num, show):
    img = cv.imread(experiment_path.format(val=frame_num.value), cv.IMREAD_GRAYSCALE)
    show(img)
    return (img,)


@app.cell
def __(cv, img, show):
    img_blur = cv.blur(img, (3, 3))
    show(img_blur)
    return (img_blur,)


@app.cell
def __(cv, img_blur, np, show):
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
    show(edges * 255)
    return edges, prewitt


@app.cell
def __(cv, edges, show):
    img_morph = cv.morphologyEx(edges, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, (30, 30)))
    show(img_morph)
    return (img_morph,)


@app.cell
def __(cv, img, img_morph, show):
    contours, _ = cv.findContours(cv.bitwise_not(img_morph), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)
    largest_contour = max(contours, key=cv.contourArea)
    color_image = cv.cvtColor(img, cv.COLOR_GRAY2BGR)

    central_contours = [c for c in contours if cv.contourArea(c)/cv.contourArea(largest_contour) > 0.1]
    cv.drawContours(color_image, central_contours, -1, (0, 255, 0), 2)
    show(color_image)
    return central_contours, color_image, contours, largest_contour


@app.cell
def __(central_contours, cv, img, np, show):
    mask = np.zeros(img.shape, np.uint8)
    cv.drawContours(mask, central_contours, -1, 255, -1)

    wound = (mask == 255) * img
    show(wound)
    return mask, wound


@app.cell
def __(prewitt, show, wound):
    edges_inner = prewitt(wound, 10)
    show(edges_inner)
    return (edges_inner,)


@app.cell
def __(central_contours, cv, img, np, show):
    contour_mask = cv.drawContours(np.zeros(img.shape, np.uint8), central_contours, -1, 255, 2)
    show(contour_mask)
    return (contour_mask,)


@app.cell
def __(contour_mask, cv, edges_inner, show):
    inner = edges_inner-contour_mask

    inner = cv.morphologyEx(inner, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_ELLIPSE, (3, 3)))
    _, inner = cv.threshold(inner, 127, 255, cv.THRESH_BINARY)

    show(inner)
    return (inner,)


@app.cell
def __(cv, inner, show):
    morph_inner = cv.morphologyEx(inner, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, (30, 30)))

    show(morph_inner)
    return (morph_inner,)


@app.cell
def __(cv, img, morph_inner, show):
    contours_inner, _ = cv.findContours(morph_inner, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)

    contours_inner_correct_size = list(filter(lambda x: cv.contourArea(x) > 100, contours_inner))

    color_image_2 = cv.cvtColor(cv.equalizeHist(img), cv.COLOR_GRAY2BGR)
    cv.drawContours(color_image_2, contours_inner_correct_size, -1, (255, 0, 0), 2)
    show(color_image_2)
    return color_image_2, contours_inner, contours_inner_correct_size


@app.cell
def __(central_contours, color_image_2, cv, show):
    color_image_3 = color_image_2.copy()
    cv.drawContours(color_image_3, central_contours, -1, (0, 255, 0), 2)
    show(color_image_3)
    return (color_image_3,)


if __name__ == "__main__":
    app.run()
