const questions = [
  {
    q: "How do I know if a charger fits my EV?",
    a: "Check the connector type and charging power in the listing. Compare those specifications with your vehicle manual, including any adapter the manufacturer requires.",
  },
  {
    q: "What will my charging session cost?",
    a: "The estimate uses your requested energy, the station’s rate per kWh and its convenience fee. Review the breakdown before you reserve. Actual energy may be recorded at the end of the session.",
  },
  {
    q: "Can I cancel a reservation?",
    a: "Open My Bookings and choose the cancellation option on an eligible booking. Your account shows the current status and available actions.",
  },
  {
    q: "Are the Jaipur stations real?",
    a: "Listings marked Demo listing use fictional locations and illustrative photos. Sample reviews are labeled. Use these listings to try the application without planning a real charging visit.",
  },
  {
    q: "Where do I get help with a charging session?",
    a: "Open Contact & Support and include the booking ID if you have it. Stop the session if you notice overheating, visible damage or another electrical concern.",
  },
  {
    q: "How are host applications reviewed?",
    a: "Administrators review charger details, operating hours, host terms and safety declarations. Local identity simulations are labeled and do not verify a government identity.",
  },
  {
    q: "Can drivers see my exact home address?",
    a: "Public discovery displays the general location. Eligible drivers see the station’s arrival details in their confirmed booking.",
  },
  {
    q: "Will a demo checkout charge my payment method?",
    a: "Demo checkout simulates payment and does not collect payment details. Razorpay test checkout also creates test transactions without transferring money.",
  },
];

export function FrequentlyAsked({ limit }: { limit?: number }) {
  return (
    <div className="pl-faq-list">
      {questions.slice(0, limit).map(({ q, a }) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
