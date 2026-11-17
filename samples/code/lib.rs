// Rust sample
#[derive(Debug)]
pub struct Turbine {
    pub name: String,
    pub power_kw: f64,
}

pub fn total(farm: &[Turbine]) -> f64 {
    farm.iter().map(|t| t.power_kw).sum()
}
