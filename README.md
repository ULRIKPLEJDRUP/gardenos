# GardenOS (MVP)

GardenOS er en webapp med et interaktivt satellitkort over haven, hvor du kan:

- tegne bede (polygoner)
- placere træer og buske (punkter)
- skrive noter om hvad der plantes
- gemme havens layout (lokalt i browseren)

## Opsætning

### 1) Installér dependencies

```bash
npm install
```

### 2) Kør appen

```bash
npm run dev
```

Åbn http://localhost:3000

## Noter

- Layout og seneste kort-visning gemmes automatisk i `localStorage`.
- Kortet bruger OpenStreetMap tiles (ingen login/keys).
- Spec/produktbeskrivelse ligger i `PROJECT_SPEC.md`.
