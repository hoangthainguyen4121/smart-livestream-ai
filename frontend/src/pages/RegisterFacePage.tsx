import { FaceRegistrationPanel } from "../components/FaceRegistrationPanel";


const DEFAULT_DISPLAY_NAME = "hoang";


export function RegisterFacePage() {
  return (
    <main className="page">
      <section className="registerFacePage">
        <header className="registerFaceHeader">
          <div>
            <p className="eyebrow">Smart Livestream AI MVP</p>
            <h1>Register Face Profile</h1>
            <p className="streamMeta">
              This page uses the browser camera for registration. Return to the
              livestream after completing registration to verify recognition in
              Backend Annotated Stream.
            </p>
          </div>
          <a className="navButton" href="/">
            Back to Livestream
          </a>
        </header>

        <FaceRegistrationPanel defaultDisplayName={DEFAULT_DISPLAY_NAME} />
      </section>
    </main>
  );
}
