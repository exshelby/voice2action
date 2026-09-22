"""A small, offline TF-IDF classifier with an extractive summary.

It uses synthetic examples embedded below. It never downloads a model, sends
text to a service, or changes the original transcript.
"""

import json
import math
import re
import sys
from collections import Counter


MODEL_VERSION = "local-tfidf-v1"
EXAMPLES = {
    "DELIVERY_DELAY": [
        "My delivery was late",
        "The package arrived late",
        "My order has not arrived yet",
        "The courier missed the promised delivery time",
        "I am still waiting for my parcel",
        "My shipment is delayed",
        "The driver was late with my order",
        "My delivery date has passed",
    ],
    "DELIVERY_PROBLEM": [
        "My parcel was delivered to the wrong address",
        "The package is missing",
        "My order arrived damaged in transit",
        "The courier lost my shipment",
        "Part of my delivery is missing",
        "The tracking says delivered but I did not receive it",
        "The delivery person left my package in the wrong place",
        "My order was sent to another customer",
    ],
    "PRODUCT_QUALITY": [
        "The product arrived broken",
        "This item does not work",
        "The goods are defective",
        "The food was cold and spoiled",
        "The item is poor quality",
        "The product is damaged",
        "My purchase stopped working",
        "The product was not as described",
    ],
    "BILLING_PAYMENT": [
        "I was charged twice",
        "The payment failed but money left my account",
        "I have not received my refund",
        "The invoice amount is wrong",
        "My card was billed incorrectly",
        "I need a refund for the charge",
        "The subscription payment is incorrect",
        "There is an extra fee on my bill",
    ],
    "CUSTOMER_SERVICE": [
        "Support has not responded to me",
        "The agent was rude",
        "Customer service did not help",
        "I could not reach the help desk",
        "The representative gave me the wrong answer",
        "Nobody replied to my complaint",
        "The support team was unhelpful",
        "I waited too long for an agent",
    ],
    "APP_TECHNICAL": [
        "The app keeps crashing",
        "I cannot log in to my account",
        "The website does not load",
        "The checkout button is broken",
        "I see an error on the screen",
        "The application freezes when I open it",
        "My password reset link does not work",
        "The page is not working",
    ],
    "SUGGESTION": [
        "I suggest adding a tracking feature",
        "Please add a way to save my address",
        "It would be helpful to get a notification",
        "I have an idea to improve the service",
        "You should offer more payment options",
        "Could you add a dark mode",
        "I recommend a faster checkout process",
        "Please consider offering weekend delivery",
    ],
    "COMPLIMENT": [
        "Thank you for the excellent service",
        "The delivery was fast and the driver was kind",
        "I am happy with the product",
        "Your team did a wonderful job",
        "The support agent was very helpful",
        "I had a great experience",
        "Everything worked perfectly",
        "I appreciate your quick response",
    ],
}

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
    "from", "had", "has", "have", "i", "in", "is", "it", "me", "my", "of",
    "on", "or", "our", "the", "their", "there", "this", "to", "was", "were",
    "will", "with", "you", "your",
}


def words(text: str) -> list[str]:
    return [word for word in re.findall(r"[a-z]+", text.lower()) if word not in STOP_WORDS]


def normalize(vector: dict[str, float]) -> dict[str, float]:
    length = math.sqrt(sum(value * value for value in vector.values()))
    return {word: value / length for word, value in vector.items()} if length else {}


def model() -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    documents = [(category, words(example)) for category, examples in EXAMPLES.items() for example in examples]
    document_frequency = Counter(word for _, tokens in documents for word in set(tokens))
    idf = {
        word: math.log((len(documents) + 1) / (frequency + 1)) + 1
        for word, frequency in document_frequency.items()
    }
    centroids: dict[str, Counter] = {category: Counter() for category in EXAMPLES}

    for category, tokens in documents:
        vector = normalize({word: count * idf[word] for word, count in Counter(tokens).items()})
        centroids[category].update(vector)

    return idf, {category: normalize(dict(vector)) for category, vector in centroids.items()}


def short_summary(transcript: str) -> tuple[str, bool]:
    cleaned = re.sub(r"\s+", " ", transcript).strip()
    cleaned = re.sub(r"^(?:(?:hi|hai|hello|hey)[,!?. ]+)", "", cleaned, flags=re.IGNORECASE).strip()
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    source = " ".join(sentences[:2]) if sentences else cleaned
    was_shortened = len(sentences) > 2 or len(source) > 240

    if len(source) > 240:
        source = source[:237].rsplit(" ", 1)[0].rstrip(",;:") + "..."

    if not source:
        raise ValueError("The transcript contains no words to summarize.")

    return source[0].upper() + source[1:], was_shortened


def classify(transcript: str) -> dict:
    if not isinstance(transcript, str) or not transcript.strip():
        raise ValueError("A non-empty transcript is required.")

    idf, centroids = model()
    tokens = Counter(words(transcript))
    vector = normalize({word: count * idf[word] for word, count in tokens.items() if word in idf})
    ranked = sorted(
        ((category, sum(weight * centroids[category].get(word, 0) for word, weight in vector.items()))
         for category in centroids),
        key=lambda item: item[1],
        reverse=True,
    )
    top_category, top_score = ranked[0]
    runner_up_score = ranked[1][1]
    uncertain = top_score < 0.25 or top_score - runner_up_score < 0.06
    summary, shortened = short_summary(transcript)

    return {
        "category": "OTHER" if uncertain else top_category,
        "summary": summary,
        "score": round(top_score, 4),
        "needsReview": uncertain or shortened,
        "model": MODEL_VERSION,
    }


def main() -> int:
    try:
        transcript = sys.stdin.read(20_001)
        if len(transcript) > 20_000:
            raise ValueError("The transcript is too long for local classification.")
        print(json.dumps(classify(transcript), ensure_ascii=False))
        return 0
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
