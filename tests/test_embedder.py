import unittest
from unittest.mock import patch

from rag_layer import embedder
from rag_layer.config import VECTOR_DIM


class FakeResponse:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise embedder.requests.HTTPError(
                f"{self.status_code} Client Error"
            )

    def json(self):
        return self._body


class EmbedderTests(unittest.TestCase):
    def setUp(self):
        embedder._endpoint_cache = None

    def tearDown(self):
        embedder._endpoint_cache = None

    def test_extract_vector_rejects_empty_embedding_payload(self):
        with self.assertRaises(embedder.EmbeddingResponseError):
            embedder._extract_vector({"embedding": []}, url="http://ollama/api/embed")

    @patch("rag_layer.embedder.time.sleep", return_value=None)
    @patch("rag_layer.embedder.requests.post")
    def test_embed_single_falls_back_to_current_embed_endpoint(self, mock_post, _mock_sleep):
        mock_post.side_effect = [
            FakeResponse(status_code=404),
            FakeResponse(body={"embeddings": [[1.0] * VECTOR_DIM]}),
        ]

        vector = embedder._embed_single("hello")

        self.assertEqual(len(vector), VECTOR_DIM)
        self.assertEqual(embedder._endpoint_cache, (embedder.OLLAMA_EMBED_URL, "input"))
        self.assertEqual(mock_post.call_count, 2)

        first_call = mock_post.call_args_list[0]
        second_call = mock_post.call_args_list[1]
        self.assertEqual(first_call.kwargs["json"]["prompt"], "hello")
        self.assertEqual(second_call.kwargs["json"]["input"], "hello")

    @patch("rag_layer.embedder.time.sleep", return_value=None)
    @patch("rag_layer.embedder.requests.post")
    def test_invalid_payloads_disable_endpoint_cache_after_retries(self, mock_post, _mock_sleep):
        mock_post.return_value = FakeResponse(body={"embedding": []})

        with self.assertRaises(ConnectionError):
            embedder._embed_single("hello")

        self.assertFalse(embedder._endpoint_cache)

        mock_post.reset_mock()

        with self.assertRaises(ConnectionError):
            embedder._embed_single("hello again")

        mock_post.assert_not_called()


if __name__ == "__main__":
    unittest.main()

