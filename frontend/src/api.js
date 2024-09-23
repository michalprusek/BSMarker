const FETCH_HIST_COUNT = 5;
const INITIAL_HIST_COUNT = FETCH_HIST_COUNT;

const gql_query = `
query experimentInfoQuick($id: ID!) {
  experiment(id: $id) {
    id,
    url,
    name,
    frameCount,
    frames {
      id,
      image {
        name
      }
    },
  }
}

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
        operation,
        surface
      }
    },
  }
}

mutation updatePolygon($id: ID!, $data: [[Float!]!]!, $operation: String!) {
  updatePolygon(id: $id, data: $data, operation: $operation) {
    id,
    data,
    operation,
    surface
  }
}

mutation createPolygon($frame_id: ID!) {
  createPolygon(frameId: $frame_id, data: [[0.1, 0.1], [0.2, 0.1], [0.1, 0.2]]) {
    id,
    data,
    operation,
    surface
  }
}

mutation deletePolygons($ids: [ID!]!) {
  deletePolygons(ids: $ids)
}

mutation detect($frame_id: ID!) {
  detect(frameId: $frame_id) {
    id,
    data,
    operation,
    surface
  }
}

mutation detectFreeCells($frame_id: ID!) {
  detectFreeCells(frameId: $frame_id) {
    id,
    data,
    operation,
    surface
  }
}

mutation detectAll($experiment_id: ID!) {
  detectAll(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      operation,
      surface
    }
  }
}

mutation detectFreeCellsAll($experiment_id: ID!) {
  detectFreeCellsAll(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      operation,
      surface
    }
  }
}

mutation detectFull($experiment_id: ID!) {
  detectFull(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      operation,
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
      operation,
      surface
    }
  }
}

query projectStats($project_id: ID!) {
  project(id: $project_id) {
    id,
    name,
    experiments {
      name
      frames {
        surface
      }
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

export function experiment_info_quick(experiment_id) {
    return query("experimentInfoQuick", {
        "id": experiment_id
    }).then(res => res["data"]["experiment"]);
}

export function experiment_info(experiment_id) {
    return query("experimentInfo", {
        "id": experiment_id
    }).then(res => res["data"]["experiment"]);
}

export function update_polygon(polygon_id, data, operation) {
    return query("updatePolygon", {
        "id": polygon_id,
        "data": data,
        "operation": operation
    }).then(res => res["data"]["updatePolygon"]);
}

export function create_polygon(frame_id) {
    return query("createPolygon", {
        "frame_id": frame_id,
    }).then(res => res["data"]["createPolygon"]);
}

export function delete_polygons(ids) {
    return query("deletePolygons", {
        "ids": ids,
    });
}

export function detect(frame_id) {
    return query("detect", {
        "frame_id": frame_id,
    }).then(res => res["data"]["detect"]);
}

export function detect_free_cells(frame_id) {
    return query("detectFreeCells", {
        "frame_id": frame_id,
    }).then(res => res["data"]["detectFreeCells"]);
}

export function detect_all(experiment_id) {
    return query("detectAll", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectAll"]);
}

export function detect_free_cells_all(experiment_id) {
    return query("detectFreeCellsAll", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectFreeCellsAll"]);
}

export function detect_full(experiment_id) {
    return query("detectFull", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectFull"]);
}

export function clear_polys(experiment_id) {
    return query("clearPolys", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["clearPolys"]);
}

export function project_stats(project_id) {
    return query("projectStats", {
        "project_id": project_id,
    }).then(res => res["data"]["project"]);
}
