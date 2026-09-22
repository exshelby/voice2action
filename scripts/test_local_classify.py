import unittest

from local_classify import classify


class LocalClassificationTests(unittest.TestCase):
    def test_delivery_delay_and_greeting_cleanup(self):
        result = classify("Hai, my delivery was late.")
        self.assertEqual(result["category"], "DELIVERY_DELAY")
        self.assertEqual(result["summary"], "My delivery was late.")
        self.assertFalse(result["needsReview"])

    def test_billing_and_technical_examples(self):
        self.assertEqual(classify("I was charged twice for the same order.")["category"], "BILLING_PAYMENT")
        self.assertEqual(classify("The app keeps crashing when I sign in.")["category"], "APP_TECHNICAL")

    def test_unclear_message_is_marked_for_review(self):
        result = classify("Something happened and I am not sure what to say.")
        self.assertEqual(result["category"], "OTHER")
        self.assertTrue(result["needsReview"])

    def test_summary_only_uses_words_from_the_transcript(self):
        result = classify("Hello! The parcel was late. I had to wait all day. There is another issue.")
        self.assertEqual(result["summary"], "The parcel was late. I had to wait all day.")
        self.assertTrue(result["needsReview"])


if __name__ == "__main__":
    unittest.main()
