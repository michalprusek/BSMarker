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
      histogram
    },
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

export function next_histograms(experiment_id, offset) {
    return query("nextHistograms", {
        "id": experiment_id,
        "offset": offset
    }).then(res => res["data"]["experiment"]["histograms"]);
}
