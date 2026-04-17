export function toolResponse(data, text) {
  return {
    content: [
      {
        type: 'text',
        text: text ?? JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

