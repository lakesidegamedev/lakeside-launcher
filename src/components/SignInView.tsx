import type { GameRow } from "../lib/rows";
import type { SignInProvider } from "../lib/signin";
import { Thumb } from "./Thumb";

interface Props {
  freeGames: readonly GameRow[];
  onSignIn: (provider: SignInProvider) => void;
  onGuest: () => void;
}

export function SignInView({ freeGames, onSignIn, onGuest }: Props): JSX.Element {
  return (
    <section className="signin">
      <div>
        <h1 className="big">Sign in</h1>
        <div className="sub" style={{ margin: "3px 0 16px" }}>
          Access your games, purchases, and memberships.
        </div>
        <button type="button" className="btn p block" onClick={() => onSignIn("ahd")}>
          Sign in with Lakeside Games
        </button>
        <div className="muted small" style={{ marginTop: 7 }}>
          Use your A House Divided login. New here? Create an account on the sign-in page.
        </div>
        <div className="divider">Other ways in</div>
        <div className="grid1">
          <button type="button" className="btn s block" onClick={() => onSignIn("discord")}>
            Discord
          </button>
        </div>
        <div style={{ height: 14 }} />
        <button type="button" className="btn block" onClick={onGuest}>
          Continue without signing in
        </button>
        <div className="muted small" style={{ marginTop: 7 }}>
          Free games work without an account.
        </div>
        <div className="note" style={{ marginTop: 18 }}>
          <b>Payments by Stripe.</b> We never see your card. Every purchase has a 14 day refund.
        </div>
      </div>
      <div>
        <h2 style={{ marginTop: 6 }}>Playable without an account</h2>
        <table>
          <tbody>
            {freeGames.map((row) => (
              <tr key={row.product.id}>
                <td>
                  <div className="rowlink static">
                    <Thumb product={row.product} />
                    <span>
                      <b>{row.title}</b>
                      <small>{row.blurb}</small>
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted small" style={{ marginTop: 9 }}>
          Signing in adds your purchases and one login across every device.
        </div>
      </div>
    </section>
  );
}
