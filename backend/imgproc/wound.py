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


def wound_contour(img, approx=None):
    """Find the contour of the wound"""
    mask = wound_mask(img)

    contours, _ = cv.findContours(
        cv.bitwise_not(mask), 
        cv.RETR_EXTERNAL, 
        cv.CHAIN_APPROX_SIMPLE
    )
    largest = max(contours, key=cv.contourArea, default=None)

    if approx is not None:
        largest = cv.approxPolyDP(largest, approx, True)
    return largest.reshape((largest.shape[0], 2))
