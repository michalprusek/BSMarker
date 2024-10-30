import cv2 as cv
import numpy as np


def prewitt(img, thresh):
    """Perform a Prewitt edge detection filter"""
    temp = img.astype(np.float32)
    m1 = np.array([
        [-1,  0,  1], 
        [-1,  0,  1], 
        [-1,  0,  1]
    ])
    m2 = np.array([
        [-1, -1,  0], 
        [-1,  0,  1], 
        [ 0,  1,  1]
    ])
    gx = cv.filter2D(img, ddepth=-1, kernel=m1)
    gy = cv.filter2D(img, ddepth=-1, kernel=np.transpose(m1))
    gd1 = cv.filter2D(img, ddepth=-1, kernel=m2)
    gd2 = cv.filter2D(img, ddepth=-1, kernel=np.rot90(m2))
    edges1 = np.hypot(gx, gy) >= thresh
    edges2 = np.hypot(gd1, gd2) >= thresh
    return (edges1 | edges2).astype(np.uint8) * 255


def edges(img):
    """Blur + edge detect"""
    img_blur = cv.blur(img, (3, 3))
    return prewitt(img_blur, 10)


def wound_mask(img):
    """Find the mask of the wound"""
    return cv.morphologyEx(
        edges(img), 
        cv.MORPH_CLOSE, 
        cv.getStructuringElement(cv.MORPH_ELLIPSE, (30, 30))
    )


def wound_contours(img, approx=None, threshold=0.005):
    """Find the contours of the wound"""
    mask = wound_mask(img)

    contours, _ = cv.findContours(
        cv.bitwise_not(mask), 
        cv.RETR_EXTERNAL, 
        cv.CHAIN_APPROX_SIMPLE
    )

    central_contours = [c for c in contours if cv.contourArea(c) >= threshold*img.shape[0]*img.shape[1]]

    if approx is not None:
        for i, c in enumerate(central_contours):
            central_contours[i] = cv.approxPolyDP(c, approx, True)

    return [c.reshape((c.shape[0], 2)) for c in central_contours]


def cut_out(img, contours):
    """Convert contours to a mask"""
    mask = np.zeros(img.shape, np.uint8)
    cv.drawContours(mask, contours, -1, 255, -1)
    return img * (mask == 255)


def free_cells(img, contours, approx=None, min_area=240):
    """Locate free cells inside a wound contour with area >= min_area"""

    wound = cut_out(img, contours)
    edges_inner = prewitt(wound, 10)
    outline = cv.drawContours(np.zeros(img.shape, np.uint8), contours, -1, 255, 2)

    inner = edges_inner-outline
    inner = cv.morphologyEx(inner, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_ELLIPSE, (3, 3)))
    _, inner = cv.threshold(inner, 127, 255, cv.THRESH_BINARY)

    morph_inner = cv.morphologyEx(inner, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_ELLIPSE, (30, 30)))

    contours_inner, _ = cv.findContours(morph_inner, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    return [(cv.approxPolyDP(c, approx, True)[:, 0] if approx else c[:, 0]) for c in contours_inner if cv.contourArea(c) > min_area]
