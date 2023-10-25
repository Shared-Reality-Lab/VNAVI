from flask import Flask, request, make_response
from werkzeug.exceptions import BadRequest
from PIL import Image
import torch
import cv2
import io
import json
import pandas as pd
import numpy as np
app = Flask(__name__)
import os
from colorthief import ColorThief
from scipy.spatial.distance import cdist

custom_colors = np.array([
    [255, 0, 0],    # Red
    [0, 255, 0],    # Green
    [0, 0, 255],    # Blue
    [255, 255, 0],  # Yellow
    [0, 255, 255],   # Cyan
    [255, 0, 255],   # Magenta
    [255, 153, 204], # Pink
    [150, 75, 0],    # Brown
    [255, 255, 255],  # White
    [0, 0, 0],  # Black
    [128, 128, 128],  # Gray
    [128, 0, 128],  # Purple  
])

color_names = np.array([
    'Red',
    'Green',
    'Blue',
    'Yellow',
    'Cyan',
    'Magenta',
    'Pink',
    'Brown',
    'White',
    'Black',
    'Gray',
    'Purple',
])

if os.path.isfile("yolov5_models/door_detect/best.pt"):
    print("Model file exists")
else:
    print("Model file not found")
model = torch.hub.load("ultralytics/yolov5", "custom", path="yolov5_models/door_detect/best.pt", force_reload=True)


def extract_image(request_in):
    if 'file' not in request_in.files:
        raise BadRequest("Missing file (image/jpeg).")
    file = request_in.files['file']
    if file.filename == '':
        raise BadRequest("File name is invalid.")
    return file


@app.route('/')
def hello_world():
    return '<h1>Welcome to VNAVI!</h1>'


@app.route('/detect-res-img', methods=['POST'])
def detect():
    file = extract_image(request)
    image = Image.open(io.BytesIO(file.read()))
    result = model(image, size=1280)
    h = result.render()[0].shape[0]
    y0 = int(0.1 * h)        
    _, result_df = parse_result(result)
    result_message = str(result_df)
    result.render()
    for img in result.render():
        rgb_image = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        for i, line in enumerate(result_message.split('\n')):
            y = int(y0 + 0.03 * h * i)
            cv2.putText(rgb_image, line, (0, y), cv2.FONT_HERSHEY_PLAIN, 2.4, (255, 170, 86), 3, cv2.LINE_AA)
        arr = cv2.imencode('.jpg', rgb_image)[1]
        response = make_response(arr.tobytes())
        response.headers['Content-Type'] = 'image/jpeg'
    return response


def parse_result(result):
    h = result.render()[0].shape[0]
    w = result.render()[0].shape[1]
    df = result.pandas().xyxy[0]
    df = df.drop(df[(df['name'] != 'handle') & (df['name'] != 'door')].index)
    print(df)
    data_list = []
    for i in range(df.shape[0]):
        est_orientation = 0
        w_mid_pt = (float(df.iloc[i]['xmin']) + float(df.iloc[i]['xmax'])) / 2
        slice_thirty_deg = float(w) / 8.0
        if w_mid_pt <= slice_thirty_deg:
            est_orientation = 10
        elif slice_thirty_deg < w_mid_pt <= 3 * slice_thirty_deg:
            est_orientation = 11
        elif 3 * slice_thirty_deg < w_mid_pt <= 5 * slice_thirty_deg:
            est_orientation = 12
        elif 5 * slice_thirty_deg < w_mid_pt <= 7 * slice_thirty_deg:
            est_orientation = 1
        elif w_mid_pt > 7 * slice_thirty_deg:
            est_orientation = 2
        est_distance = 999
        confidence = float(df.iloc[i]['confidence'])
        if confidence >= 0.1:
            door_height = float(df.iloc[i]['ymax']) - float(df.iloc[i]['ymin'])
            dh_to_h_r = door_height / h
            if dh_to_h_r >= 1:
                est_distance = 0
            else:
                est_distance = 1.5 / dh_to_h_r
        if i in df.index:
            file = extract_image(request)
            image = Image.open(file)
            xmin, ymin, xmax, ymax = df.iloc[i]['xmin'], df.iloc[i]['ymin'], df.iloc[i]['xmax'], df.iloc[i]['ymax']
            cropped_img = image.crop((xmin, ymin, xmax, ymax))
            cropped_img.save('cropped_img.jpg')
            color_thief = ColorThief('cropped_img.jpg')
            dominant_color = color_thief.get_color(quality=1)
            distances = cdist(custom_colors, [dominant_color])
            closest_color_index = np.argmin(distances)
            closest_color = color_names[closest_color_index]
            print(closest_color)
            data_list.insert(len(data_list),
                            [est_orientation,
                            float("{:.3f}".format(est_distance)),
                            float("{:.3f}".format(confidence)),
                            df.iloc[i]['name'],
                            float("{:.3f}".format((df.loc[i]['xmax'] + df.loc[i]['xmin'])/2)),
                            closest_color])
    sorted_data_list = sorted(data_list, key=lambda x: x[0])
    new_df = pd.DataFrame(sorted_data_list, columns=['orie(clk)', 'dist(m)', 'conf', 'name', 'center coords (x)', 'color'])
    print('\n')
    print(new_df)
    df_json = new_df.to_json(orient='split')
    res_json = json.loads(df_json)
    print('\n')
    print(res_json)
    return json.dumps(res_json, indent=4), new_df


@app.route('/detect-res-json', methods=['POST'])
def detect_res_json():
    file = extract_image(request)
    image = Image.open(io.BytesIO(file.read()))
    result = model(image, size=1280)
    res_json, _ = parse_result(result)
    response = make_response(res_json, 200)
    response.headers['Content-type'] = 'application/json'
    return response


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5001)
