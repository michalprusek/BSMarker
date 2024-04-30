const FETCH_HIST_COUNT = 5;
const INITIAL_HIST_COUNT = FETCH_HIST_COUNT;

const gql_query = `
query experimentInfo($id: ID!) {
  experiment(id: $id) {
    url,
    name,
    frameCount,
    frames {
      image {
        url
      },
      histogram,
      polygons {
        id,
        data
      }
    },
  }
}

query modifiedImage($id: ID!, $num: Int!) {
  experiment(id: $id) {
    modifiedFrame(num: $num, eqhist: true) {
      dataUrl,
      histogram
    },
  }
}

mutation updatePolygon($id: ID!, $data: [[Float!]!]!) {
  updatePolygon(id: $id, data: $data) {
    id
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

export function modified_image(experiment_id, num) {
    return query("modifiedImage", {
        "id": experiment_id,
        "num": num
    }).then(res => res["data"]["experiment"]["modifiedFrame"]);
}

export function update_polygon(polygon_id, data) {
    return query("updatePolygon", {
        "id": polygon_id,
        "data": data
    });
}
