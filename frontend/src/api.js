const FETCH_HIST_COUNT = 5;
const INITIAL_HIST_COUNT = FETCH_HIST_COUNT;

const gql_query = `
query experimentInfo($id: ID!) {
  experiment(id: $id) {
    id,
    url,
    name,
    frameCount,
    frames {
      id,
      original: data {
        url,
        histogram
      },
      equalized: data(equalized: true) {
        url,
        histogram
      }
      polygons {
        id,
        data,
        surface
      }
    },
  }
}

mutation updatePolygon($id: ID!, $data: [[Float!]!]!) {
  updatePolygon(id: $id, data: $data) {
    id,
    data,
    surface
  }
}

mutation createPolygon($frame_id: ID!) {
  createPolygon(frameId: $frame_id, data: [[0.1, 0.1], [0.2, 0.1], [0.1, 0.2]]) {
    id,
    data,
    surface
  }
}

mutation deletePolygon($id: ID!) {
  deletePolygon(id: $id)
}

mutation detect($frame_id: ID!) {
  detect(frameId: $frame_id) {
    id,
    data,
    surface
  }
}

mutation detectAll($experiment_id: ID!) {
  detectAll(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      surface
    }
  }
}

mutation clearPolys($experiment_id: ID!) {
  clearPolys(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      surface
    }
  }
}
`;

function query(operation, variables) {
    return fetch("/graphql/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query: gql_query,
            operationName: operation,
            variables: variables,
        }),
    }).then(res => res.json());
}

export function experiment_info(experiment_id) {
    return query("experimentInfo", {
        "id": experiment_id
    }).then(res => res["data"]["experiment"]);
}

export function update_polygon(polygon_id, data) {
    return query("updatePolygon", {
        "id": polygon_id,
        "data": data
    }).then(res => res["data"]["updatePolygon"]);
}

export function create_polygon(frame_id) {
    return query("createPolygon", {
        "frame_id": frame_id,
    }).then(res => res["data"]["createPolygon"]);
}

export function delete_polygon(polygon_id) {
    return query("deletePolygon", {
        "id": polygon_id,
    });
}

export function detect(frame_id) {
    return query("detect", {
        "frame_id": frame_id,
    }).then(res => res["data"]["detect"]);
}

export function detect_all(experiment_id) {
    return query("detectAll", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectAll"]);
}

export function clear_polys(experiment_id) {
    return query("clearPolys", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["clearPolys"]);
}
