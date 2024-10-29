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
      },
      equalized: data(equalized: true) {
        url,
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

mutation detectWound($frame_id: ID!) {
  detectWound(frameId: $frame_id) {
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

mutation detectFull($frame_id: ID!) {
  detectFull(frameId: $frame_id) {
    id,
    data,
    operation,
    surface
  }
}

mutation detectWoundAll($experiment_id: ID!) {
  detectWoundAll(experimentId: $experiment_id) {
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

mutation detectFullAll($experiment_id: ID!) {
  detectFullAll(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      operation,
      surface
    }
  }
}

mutation clearPolys($frame_id: ID!) {
    clearPolys(frameId: $frame_id)
}

mutation clearPolysExperiment($experiment_id: ID!) {
  clearPolysExperiment(experimentId: $experiment_id) {
    id,
    polygons {
      id,
      data,
      operation,
      surface
    }
  }
}

mutation deleteFrame($frame_id: ID!) {
    deleteFrame(frameId: $frame_id)
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

query frameHistogram($frame_id: ID!, $equalized: Boolean!) {
  frame(id: $frame_id) {
    id,
    data(equalized: $equalized) {
        histogram,
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

export function detect_wound(frame_id) {
    return query("detectWound", {
        "frame_id": frame_id,
    }).then(res => res["data"]["detectWound"]);
}

export function detect_free_cells(frame_id) {
    return query("detectFreeCells", {
        "frame_id": frame_id,
    }).then(res => res["data"]["detectFreeCells"]);
}

export function detect_full(frame_id) {
    return query("detectFull", {
        "frame_id": frame_id,
    }).then(res => res["data"]["detectFull"]);
}

export function clear_polys(frame_id) {
    return query("clearPolys", {
        "frame_id": frame_id,
    }).then(res => res["data"]["clearPolys"]);
}

export function delete_frame(frame_id) {
    return query("deleteFrame", {
        "frame_id": frame_id,
    }).then(res => res["data"]["deleteFrame"]);
}

export function detect_wound_all(experiment_id) {
    return query("detectWoundAll", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectWoundAll"]);
}

export function detect_free_cells_all(experiment_id) {
    return query("detectFreeCellsAll", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectFreeCellsAll"]);
}

export function detect_full_all(experiment_id) {
    return query("detectFullAll", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["detectFullAll"]);
}

export function clear_polys_experiment(experiment_id) {
    return query("clearPolysExperiment", {
        "experiment_id": experiment_id,
    }).then(res => res["data"]["clearPolysExperiment"]);
}

export function project_stats(project_id) {
    return query("projectStats", {
        "project_id": project_id,
    }).then(res => res["data"]["project"]);
}

export function frame_histogram(frame_id, equalized) {
    return query("frameHistogram", {
        "frame_id": frame_id,
        "equalized": equalized,
    }).then(res => res["data"]["frame"]["data"]["histogram"]);
}
